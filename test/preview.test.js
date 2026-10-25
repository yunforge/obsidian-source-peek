'use strict';

// The preview layer, driven with a stub DOM and a stubbed `obsidian`.
//
// This is the layer the pure-function tests cannot reach: it is where a target becomes
// what the reader sees. It exists because a real bug hid here — the page preview read a
// setting that did not exist, so `maxBlocks` arrived as NaN and every page was cut to a
// single block. Nothing in the pure tests could have caught that.

const assert = require('assert/strict');
const Module = require('module');

// --- a DOM small enough to reason about -----------------------------------

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.classList = {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    };
    this.text = '';
    this.clientHeight = 300;
    this.offsetTop = 40;
    this.offsetHeight = 20;
    this.scrollTop = 0;
  }
  createDiv(o) { return this.createEl('div', o); }
  createSpan(o) { return this.createEl('span', o); }
  createEl(tag, o) {
    const el = new El(tag);
    if (o && o.cls) el.classList.add(o.cls);
    if (o && o.text != null) el.text = String(o.text);
    el.parentElement = this;
    this.children.push(el);
    return el;
  }
  appendText(t) { this.text += String(t); }
  setText(t) { this.text = String(t); }
  empty() { this.children = []; this.text = ''; }
  addClass(c) { this.classList.add(c); }
  removeClass(c) { this.classList.remove(c); }
  getBoundingClientRect() { return { width: 400, height: 200, left: 0, top: 0 }; }
  contains() { return false; }
  addEventListener() {}
}

// Every string drawn anywhere under `node`, in document order.
function texts(node) {
  const out = [];
  (function walk(n) {
    if (n.text) out.push(n.text);
    n.children.forEach(walk);
  })(node);
  return out;
}

const HTML_PAGE = '<html><head><title>Guide</title></head><body>'
  + '<h2>Install</h2><p>run npm i</p>'
  + '<h2>Other</h2><p>no</p></body></html>';

const REMOTE_SOURCE = Array.from({ length: 24 }, (_, i) => 'l' + (i + 1)).join('\n') + '\n';

module.exports = {
  name: 'preview: code, remote code and web sections',
  async run() {
    // The module graph is loaded through a patched loader so `obsidian` resolves to a
    // stub. The stub is installed once for the whole file, then removed.
    const realDocument = global.document;
    const realWindow = global.window;
    global.document = { body: new El('body'), createDiv: (o) => new El('div', o) };
    global.window = { innerWidth: 1200, innerHeight: 800, addEventListener() {} };

    const origLoad = Module._load;
    Module._load = function (request) {
      if (request === 'obsidian') {
        return {
          loadPrism: async () => null,
          requestUrl: async ({ url }) => {
            if (url.includes('example.com')) {
              return { status: 200, headers: { 'content-type': 'text/html' }, text: HTML_PAGE };
            }
            return { status: 200, headers: { 'content-type': 'text/plain' }, text: REMOTE_SOURCE };
          },
        };
      }
      return origLoad.apply(this, arguments);
    };

    try {
      // The preview layer looks its messages up, so the dictionary has to be resolved
      // before anything is built. These tests assert the English wording.
      global.window = global.window || {};
      global.window.localStorage = { getItem: () => 'en' };
      require('../src/i18n').initI18n();

      const { Preview } = require('../src/preview');
      const { parseTarget } = require('../src/parse');

      // A plugin stub with only what the preview reads.
      const plugin = {
        settings: {},
        resolvePath: (sourcePath, targetPath) => targetPath,
      };
      const preview = new Preview(plugin);
      const ctx = { isCurrent: () => true };

      // --- a remote code link draws exactly its lines, nothing around them ---
      const remote = parseTarget('https://github.com/o/r/blob/main/src/main.c#L18-L20');
      const el1 = new El('div');
      await preview.build(remote, '', el1, ctx);
      const drawn1 = texts(el1);
      assert.equal(drawn1[0], 'github · src/main.c:18-20', 'header names the host, the path and the range');
      const body1 = drawn1[drawn1.length - 1].split('\n');
      assert.deepEqual(body1, ['l18', 'l19', 'l20'],
        'the snippet is exactly the named lines — no context above or below');

      // --- a single line draws one line ---
      const single = parseTarget('https://github.com/o/r/blob/main/src/main.c#L18');
      const el2 = new El('div');
      await preview.build(single, '', el2, ctx);
      const drawn2 = texts(el2);
      assert.deepEqual(drawn2[drawn2.length - 1].split('\n'), ['l18'],
        'one named line draws one line');

      // --- a web page narrowed to one heading ---
      const web = parseTarget('https://example.com/page#install');
      const el3 = new El('div');
      await preview.build(web, '', el3, ctx);
      const drawn3 = texts(el3);
      assert.ok(drawn3.includes('Install'), 'the named heading is drawn');
      assert.ok(drawn3.includes('run npm i'), 'its body is drawn');
      assert.ok(!drawn3.includes('Other'), 'the next heading of the same rank stops the section');
      assert.ok(!drawn3.includes('no'), 'and its body too');

      // --- a page is drawn whole, with no block setting to cut it ---
      // This used to be a setting, and the preview read the wrong key for it, so the limit
      // arrived as NaN and collapsed to 1 — every page showed a single block. The setting is
      // gone now; what is worth pinning down is that a page draws all of its blocks.
      const el4 = new El('div');
      await preview.build(web, '', el4, ctx);
      const drawn4 = texts(el4);
      assert.ok(drawn4.includes('Install'), 'the heading');
      assert.ok(drawn4.includes('run npm i'), 'its first paragraph');
      assert.ok(drawn4.length >= 3, 'a page draws every block, not just the first');
      assert.ok(!drawn4.some((x) => /first .* block/i.test(x)), 'nothing is announced as cut');

      // --- a heading that is not on the page ---
      // Reported, and nothing else. The reader asked for one section; drawing the whole
      // page instead would answer a question they did not ask.
      const miss = parseTarget('https://example.com/page#nope');
      const el6 = new El('div');
      await preview.build(miss, '', el6, ctx);
      const drawn6 = texts(el6);
      assert.ok(drawn6.some((x) => /no heading/i.test(x)), 'the miss is explained');
      assert.ok(!drawn6.includes('Install'), 'the page body is not drawn');
      assert.ok(!drawn6.includes('run npm i'), 'and neither is its text');
      assert.ok(!drawn6.includes('Other'), 'nor anything further down');

      // --- a stale build declines to draw ---
      const el7 = new El('div');
      const stale = { isCurrent: () => false };
      const after = await preview.build(web, '', el7, stale);
      assert.equal(after, false, 'a superseded build reports that it gave up');

      // --- a local path with no readable file ---
      plugin.resolvePath = () => null;
      const local = parseTarget('../src/main.c#L1');
      const el8 = new El('div');
      await preview.build(local, '', el8, ctx);
      assert.ok(texts(el8).some((t) => /No path to read/.test(t)), 'an unresolvable path says so');
    } finally {
      Module._load = origLoad;
      global.document = realDocument;
      global.window = realWindow;
    }
  },
};
