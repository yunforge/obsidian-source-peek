'use strict';

// bug38: a background-coloured band showed behind the preview's code, offset from the
// text and covering it incompletely.
//
// The band was the target-line highlight `.cp-band` (bug19 once fixed its geometry) — but
// the preview reads exactly the lines the link names, with no context padding, so the band
// could never mark a subset: its first line was 0 and its count every line shown, always.
// It painted the whole panel with the selection colour for nothing. And it was absolutely
// positioned against `.cp-body`'s padding box while the text starts after that padding, so
// it sat 8px too high — covering the empty top padding and missing the bottom of the last
// line. A highlight that is always the whole code and aligned with none of it reads as a
// stray background; it is removed outright, element and rule both.
//
// This pins the removal through the real build path, over a real file on disk.

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Preview } = require('../src/preview');

async function section(label, fn) {
  try {
    await fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

// A recorder good enough for buildCode's DOM calls: enough structure to see which elements
// were created and with which classes.
function fakeEl() {
  const el = {
    tag: 'div', cls: '', text: '', children: [], style: {},
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
    find(cls) { return this.children.find((c) => c.cls.split(' ').includes(cls)); },
  };
  return el;
}

module.exports = {
  name: 'bug38: no background band behind the previewed code',
  async run() {
    await section('buildCode draws the code and nothing behind it', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-noband-'));
      const abs = path.join(dir, 'snippet.c');
      fs.writeFileSync(abs, Array.from({ length: 10 }, (_, i) => 'line ' + (i + 1)).join('\n') + '\n');
      const plugin = { resolvePath: () => abs, settings: {} };
      const body = fakeEl();
      const ctx = { isCurrent: () => true };
      const target = { kind: 'code', source: 'local', path: 'snippet.c', from: 3, to: 4 };
      await Preview.prototype.buildCode.call({ plugin }, target, 'note.md', body, ctx);
      assert.ok(body.find('cp-code'), 'the code block is still drawn');
      assert.equal(body.find('cp-band'), undefined, 'no cp-band element behind the code');
    });

    await section('the band is gone from the stylesheet too', async () => {
      const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
      assert.ok(!css.includes('.cp-band'), 'no .cp-band rule');
      assert.ok(!css.includes('--cp-highlight-color'), 'no highlight-colour variable left behind');
    });
  },
};
