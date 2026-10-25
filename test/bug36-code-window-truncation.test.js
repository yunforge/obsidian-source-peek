'use strict';

// bug36: a code link naming a range wider than the read window (MAX_WINDOW_LINES) drew
// the first 4000 lines and said nothing — while the web path announces its own truncation
// ("Showing the first N blocks"). The reader who linked #L1-L9000 saw the snippet stop
// mid-file with no way to tell whether that was the file or the cap.
//
// The local path is driven end to end with a real temp file, so the window, the flag and
// the note are all the production ones.

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { MAX_WINDOW_LINES } = require('../src/code');

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.classList = { add() {}, remove() {}, contains: () => false };
    this.text = '';
  }
  createDiv(o) { return this.createEl('div', o); }
  createEl(tag, o) {
    const el = new El(tag);
    if (o && o.cls) el.classNames = o.cls;
    if (o && o.text != null) el.text = String(o.text);
    el.parentElement = this;
    this.children.push(el);
    return el;
  }
  appendText(t) { this.text += String(t); }
  setText(t) { this.text = String(t); }
  addClass(c) {}
}

function texts(node) {
  // Every node's own text and class, in document order — `setText` lands on the inner
  // <code>, which carries no class of its own.
  const out = [];
  (function walk(n) {
    if (n.text) out.push({ cls: n.classNames || '', text: n.text });
    n.children.forEach(walk);
  })(node);
  return out;
}

module.exports = {
  name: 'bug36: a code window past the cap says so, like the web path does',
  async run() {
    require('../src/i18n').initI18n();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'source-peek-bug36-'));
    const file = path.join(dir, 'big.c');
    try {
      // One line more than the window: the range below asks for all of it.
      const total = MAX_WINDOW_LINES + 5;
      fs.writeFileSync(file, Array.from({ length: total }, (_, i) => 'line-' + (i + 1)).join('\n') + '\n');

      const { Preview } = require('../src/preview');
      const { parseTarget } = require('../src/parse');
      const preview = new Preview({ settings: {}, resolvePath: () => file });
      const ctx = { isCurrent: () => true };

      // --- a range wider than the window: drawn to the cap, and said so ---
      const wide = parseTarget('big.c#L1-L' + (total + 1000));
      const el1 = new El('div');
      await preview.build(wide, '', el1, ctx);
      const drawn1 = texts(el1);
      const code1 = drawn1.find((x) => /cp-code/.test(x.cls) || x.text.startsWith('line-'));
      assert.ok(code1, 'the code is drawn');
      assert.equal(code1.text.split('\n').length, MAX_WINDOW_LINES, 'exactly the cap worth of lines');
      const note1 = drawn1.find((x) => x.cls === 'cp-note');
      assert.ok(note1, 'a note is drawn');
      assert.equal(note1.text, 'Showing the first ' + MAX_WINDOW_LINES + ' lines.',
        'it names the cap, in the web path\'s voice');

      // --- a range that fits: no note ---
      const fits = parseTarget('big.c#L2-L9');
      const el2 = new El('div');
      await preview.build(fits, '', el2, ctx);
      const drawn2 = texts(el2);
      assert.ok(!drawn2.some((x) => x.cls === 'cp-note'), 'nothing is announced as cut');
      const code2 = drawn2.find((x) => x.text.startsWith('line-'));
      assert.equal(code2.text, 'line-2\nline-3\nline-4\nline-5\nline-6\nline-7\nline-8\nline-9');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
