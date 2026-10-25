'use strict';

// bug19: the highlight band over the named lines never rendered, for two reasons stacked
// on the same geometry.
//
//   1. `--cp-lh: 1.5` was a bare number. `calc(var(--cp-lh) * 3)` over a unitless variable
//      computes a number, and a number is not a length — CSS discarded the band's top and
//      height outright, so the band had no geometry at all. The variable now carries its
//      unit (1.5em); for `line-height` the two spellings agree, and only the length makes
//      the band's calc legal.
//   2. With no fallback, that discard meant nothing painted. `.cp-band` now carries
//      concrete top/height that hold when the calc is ever dropped again.
//
// The band's placement itself was never wrong: `first` is the first highlighted line's
// index within the window, and the window is always exactly the named lines (the preview
// deliberately adds no context padding), so first is 0 by construction today. The formula
// is kept as the general form and pinned through the real build path below — driven with a
// stub DOM over a real file on disk, asserting the style strings the reader's browser gets.

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

// A recorder good enough for buildCode's DOM calls. `style` is a plain object, so the
// style strings the plugin writes can be read straight back.
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
    find(cls) { return this.children.find((c) => c.cls === cls); },
  };
  return el;
}

// Build through the real buildCode over a real 10-line file.
async function bandFor(from, to) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-band-'));
  const abs = path.join(dir, 'snippet.c');
  fs.writeFileSync(abs, Array.from({ length: 10 }, (_, i) => 'line ' + (i + 1)).join('\n') + '\n');
  const plugin = { resolvePath: () => abs, settings: {} };
  const body = fakeEl();
  const ctx = { isCurrent: () => true };
  const target = { kind: 'code', source: 'local', path: 'snippet.c', from, to };
  await Preview.prototype.buildCode.call({ plugin }, target, 'note.md', body, ctx);
  const band = body.find('cp-band');
  assert.ok(band, 'buildCode must create the cp-band element');
  return band;
}

function cssRule(css, selector) {
  const at = css.indexOf(selector + ' {');
  assert.ok(at >= 0, selector + ' rule present');
  const end = css.indexOf('}', at);
  return css.slice(at, end);
}

module.exports = {
  name: 'bug19: the highlight band has geometry — a length variable, a fallback, real style strings',
  async run() {
    await section('the band the reader gets: top at the window, height in lines', async () => {
      const band = await bandFor(3, 4);
      // first is the highlighted lines' index inside the window — 0, because the window is
      // exactly the named lines. If the preview ever pads context, this index moves with it.
      assert.equal(band.style.top, 'calc(var(--cp-lh) * 0)');
      assert.equal(band.style.height, 'calc(var(--cp-lh) * 2)');
      // A range running past the end of the file is clamped by the window, not by the link:
      // the band covers the lines that are actually there.
      const past = await bandFor(8, 999);
      assert.equal(past.style.height, 'calc(var(--cp-lh) * 3)');
    });

    await section('--cp-lh is a length, so the inline calc computes a length', async () => {
      const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
      const decl = /--cp-lh:\s*([^;]+);/.exec(css);
      assert.ok(decl, '--cp-lh is declared');
      assert.match(decl[1].trim(), /^[\d.]+(em|px|rem)$/,
        '--cp-lh must carry a unit; a bare number turns calc(var(--cp-lh) * N) into a number, which CSS discards');
    });

    await section('.cp-band has a concrete-geometry fallback under the inline calc', async () => {
      const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
      const rule = cssRule(css, '.cp-band');
      assert.match(rule, /top:\s*0\s*;/, 'fallback top');
      assert.match(rule, /height:\s*[\d.]+(em|px)\s*;/, 'fallback height — one line of concrete length');
    });
  },
};
