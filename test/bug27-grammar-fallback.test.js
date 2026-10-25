'use strict';

// bug27: grammarFor answered `prismId === ''` with Prism's clike grammar — a guess. The
// web-side parser promises the opposite in its own comments ("Empty when the page says
// nothing — then the block is still drawn as a code block, just uncoloured"; renderBlock:
// "falls back to plain text when it declared none"), and the renderer broke that promise by
// painting language-less blocks with whatever clike survives. A block that names no
// language now stays plain; so does one that names a language Prism does not know — a
// guess is still a guess. A language Prism knows is used as named.

const assert = require('assert/strict');
const Module = require('module');

function section(label, fn) {
  return Promise.resolve().then(fn).catch((err) => {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  });
}

function fakeEl() {
  const el = {
    tag: '', cls: '', text: '', children: [],
    createDiv(o) { return this.make('div', o); },
    createSpan(o) { return this.make('span', o); },
    createEl(tag, o) { return this.make(tag, o); },
    make(tag, o) {
      const c = fakeEl();
      c.tag = tag;
      c.cls = (o && o.cls) || '';
      if (o && o.text !== undefined) c.text = o.text;
      this.children.push(c);
      return c;
    },
    appendText(t) { this.text += t; },
    setText(t) { this.text = t; },
    addClass() {},
  };
  return el;
}

const TOKENS = ['let ', { type: 'keyword', content: 'x' }, ' = 1'];

async function rendered(prismId) {
  const tokenizeCalls = [];
  const P = {
    languages: { clike: { grammar: true } },
    tokenize: (text) => { tokenizeCalls.push(text); return TOKENS; },
  };
  const origLoad = Module._load;
  delete require.cache[require.resolve('../src/render')];
  Module._load = function (request) {
    if (request === 'obsidian') return { loadPrism: async () => P };
    return origLoad.apply(this, arguments);
  };
  try {
    const { renderCode } = require('../src/render');
    const parent = fakeEl();
    await renderCode(parent, 'let x = 1', prismId);
    const pre = parent.children[0];
    const code = pre.children[0];
    return { code, tokenizeCalls };
  } finally {
    Module._load = origLoad;
  }
}

module.exports = {
  name: 'bug27: a block that names no language is not painted with a guess',
  async run() {
    await section('no language: plain text, tokenizer never asked', async () => {
      const { code, tokenizeCalls } = await rendered('');
      assert.deepEqual(tokenizeCalls, [], 'a language-less block is not tokenized');
      assert.equal(code.text, 'let x = 1', 'the source is drawn as plain text');
      assert.deepEqual(code.children, [], 'no token spans');
    });

    await section('a language Prism knows: used as named', async () => {
      const { code, tokenizeCalls } = await rendered('clike');
      assert.deepEqual(tokenizeCalls, ['let x = 1']);
      // Strings become plain text on the element; only tokens become children.
      assert.equal(code.children.length, 1, 'the token drawn as a span');
      assert.equal(code.children[0].text, 'x');
      assert.equal(code.text, 'let  = 1', 'only the string parts land on the element');
    });

    await section('a language Prism does not know: plain, not clike', async () => {
      const { code, tokenizeCalls } = await rendered('nosuchlang');
      assert.deepEqual(tokenizeCalls, [], 'an unknown name is not a licence to guess');
      assert.equal(code.text, 'let x = 1');
      assert.deepEqual(code.children, []);
    });
  },
};
