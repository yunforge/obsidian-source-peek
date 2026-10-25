'use strict';

// bug26: Prism can hand back a token whose `content` is null (an empty match does). The
// renderer took every non-string content, wrapped it into a one-element array, and
// recursed — so `content: null` came back around as a null *token*, and reading its class
// threw `TypeError: Cannot read properties of null (reading 'alias')`, taking the whole
// preview down with it. A token with no content now draws its span and nothing inside it,
// and a null slot in the token array is skipped outright.
//
// Driven through the real renderCode with a stubbed Prism (obsidian stubbed at
// Module._load, loadPrism answering a tokenizer that emits the malformed shapes).

const assert = require('assert/strict');
const Module = require('module');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
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

// Plain strings accumulate on the element's own text (appendText); each token becomes a
// child span in document order, whose own text + child spans describe its content.
function spansOf(el) {
  return el.children
    .filter((c) => c.cls.indexOf('token') === 0)
    .map((c) => '<' + c.cls + '>' + c.text +
      c.children.map((g) => '<' + g.cls + '>' + g.text + '</>').join('') + '</>');
}

// renderCode against a stub Prism whose tokenizer emits exactly the shapes in question.
async function rendered(tokens) {
  const P = {
    languages: { clike: { grammar: true } },
    tokenize: () => tokens,
  };
  const origLoad = Module._load;
  delete require.cache[require.resolve('../src/render')];
  Module._load = function (request) {
    if (request === 'obsidian') return { loadPrism: async () => P };
    return origLoad.apply(this, arguments);
  };
  try {
    // The stub has to stay installed while renderCode runs: ensurePrism's require('obsidian')
    // happens inside it, not at require time.
    const { renderCode } = require('../src/render');
    const parent = fakeEl();
    await renderCode(parent, 'irrelevant source', 'clike');
    const pre = parent.children[0];
    const code = pre.children[0];
    return { text: code.text, spans: spansOf(code) };
  } finally {
    Module._load = origLoad;
  }
}

module.exports = {
  name: 'bug26: a token with no content draws nothing instead of taking the preview down',
  async run() {
    await section('the report case: content null, undefined, and a real string', async () => {
      const { text, spans } = await rendered([
        'before ',
        { type: 'x', content: null },
        ' mid ',
        { type: 'y', content: undefined },
        { type: 'z', content: 'ok' },
        ' after',
      ]);
      assert.equal(text, 'before  mid  after', 'the plain runs are untouched');
      assert.deepEqual(spans, [
        '<token x></>',
        '<token y></>',
        '<token z>ok</>',
      ], 'empty content draws its span and nothing inside it');
    });

    await section('a null slot in the token array is skipped', async () => {
      const { text } = await rendered(['a', null, 'b']);
      assert.equal(text, 'ab');
    });

    await section('string, array and nested-token content still render as before', async () => {
      const { spans } = await rendered([
        { type: 'str', content: 'plain' },
        { type: 'arr', content: ['a', 'b'] },
        { type: 'outer', content: { type: 'inner', content: 'deep' } },
      ]);
      assert.deepEqual(spans, [
        '<token str>plain</>',
        '<token arr>ab</>',
        '<token outer><token inner>deep</></>',
      ]);
    });
  },
};
