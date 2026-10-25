'use strict';

// bug33: a build that *throws* was the one way to give up that `show()` did not know about.
// Returning `false` tidied the panel (bug in popover-bail.test.js's history), but an
// exception — Prism's tokenizer on a pathological snippet is the realistic case —
// rejected `show` itself: an unhandled rejection, a panel still on screen holding
// whatever was drawn before the throw, and `this.key` still naming the *older* content.
// `schedule()`'s same-key early return then answered "already up" for the link whose
// panel had just died, and hovering it again never rebuilt anything.
//
// The fake DOM and clock are the same as popover-bail.test.js; a thrown build is written
// inline because the way it fails is the thing under test.

const assert = require('assert/strict');
const { Popover, SHOW_DELAY } = require('../src/popover');

class El {
  constructor(nodeName) {
    this.nodeName = String(nodeName);
    this.children = [];
    this.style = {};
    this.listeners = {};
    this.classList = {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    };
  }
  createDiv(o) {
    const el = new El('div');
    // Obsidian's `createDiv({ cls })` takes a space-separated list; splitting it is what
    // makes `isVisible()` mean something (see popover-bail.test.js).
    if (o && o.cls) String(o.cls).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
    if (o && o.text) el.text = o.text;
    el.parentElement = this;
    this.children.push(el);
    return el;
  }
  addClass(c) { this.classList.add(c); }
  removeClass(c) { this.classList.remove(c); }
  empty() { this.children = []; }
  contains(node) {
    for (let n = node; n; n = n.parentElement) if (n === this) return true;
    return false;
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  getBoundingClientRect() { return { width: 300, height: 120, left: 0, top: 0 }; }
  remove() {}
}

function installClock() {
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  const timers = [];
  let seq = 0;

  global.setTimeout = (fn, ms) => {
    const t = { id: ++seq, due: harness.now + (ms || 0), fn };
    timers.push(t);
    return t.id;
  };
  global.clearTimeout = (id) => {
    const i = timers.findIndex((t) => t.id === id);
    if (i !== -1) timers.splice(i, 1);
  };

  const harness = {
    now: 0,
    advance(ms) {
      const target = this.now + ms;
      for (;;) {
        let next = null;
        for (const t of timers) if (t.due <= target && (!next || t.due < next.due)) next = t;
        if (!next) break;
        timers.splice(timers.indexOf(next), 1);
        this.now = next.due;
        next.fn();
      }
      this.now = target;
    },
    restore() {
      global.setTimeout = realSetTimeout;
      global.clearTimeout = realClearTimeout;
    },
  };
  return harness;
}

// `show()` awaits the build, so a fake timer firing only starts it; the rest lands in the
// microtask queue. Draining it with a real macrotask is the whole proof.
const settle = () => new Promise((resolve) => setImmediate(resolve));

function content(pop) {
  if (!pop.el) return '';
  return pop.el.children.map((c) => c.text || '').join('');
}

module.exports = {
  name: 'bug33: a build that throws hands the panel back, like one that answers false',
  async run() {
    const realDocument = global.document;
    const realWindow = global.window;
    const clock = installClock();
    global.document = { body: new El('body'), addEventListener() {} };
    global.window = { innerWidth: 1200, innerHeight: 800, addEventListener() {} };

    // Any rejection of `show` that nobody catches surfaces here.
    const rejections = [];
    const onReject = (err) => rejections.push(err);
    process.on('unhandledRejection', onReject);

    try {
      // --- 1. the reported sequence: A up, B throws, A must come back ---
      {
        const pop = new Popover({ cls: 'cp-hover', hiddenCls: 'cp-hidden' });

        pop.schedule('A', 10, 10, (el) => { el.createDiv({ cls: 'cp-body', text: 'A-content' }); return true; });
        clock.advance(SHOW_DELAY);
        await settle();
        assert.equal(pop.isVisible(), true, 'A is on screen');
        assert.equal(content(pop), 'A-content');

        // B draws part of itself, then blows up — the shape of a tokenizer dying mid-block.
        pop.schedule('B', 10, 10, async (el) => {
          el.createDiv({ cls: 'cp-header', text: 'B-header' });
          throw new Error('tokenize exploded');
        });
        clock.advance(SHOW_DELAY);
        await settle();
        await settle(); // a second tick, so an unhandled rejection would have surfaced

        assert.equal(pop.isVisible(), false, 'the panel is hidden, not left standing half-drawn');
        assert.equal(pop.key, '', 'it claims no key');
        assert.equal(content(pop), '', 'and holds nothing');
        assert.equal(rejections.length, 0, 'the throw is contained, not an unhandled rejection');

        // Back on A: the same-key early return must not answer for the panel that died.
        pop.schedule('A', 10, 10, (el) => { el.createDiv({ cls: 'cp-body', text: 'A-again' }); return true; });
        clock.advance(SHOW_DELAY);
        await settle();
        assert.equal(pop.isVisible(), true, 'A rebuilds');
        assert.equal(content(pop), 'A-again');
      }

      // --- 2. the very first build throws: the tidy-up is safe on a panel never shown ---
      {
        const pop = new Popover({ cls: 'cp-hover', hiddenCls: 'cp-hidden' });
        pop.schedule('first', 10, 10, async () => { throw new Error('no network, no draw'); });
        clock.advance(SHOW_DELAY);
        await settle();
        await settle();

        assert.equal(pop.isVisible(), false, 'never appeared');
        assert.equal(pop.key, '');

        pop.schedule('second', 10, 10, (el) => { el.createDiv({ cls: 'cp-body', text: 'works' }); return true; });
        clock.advance(SHOW_DELAY);
        await settle();
        assert.equal(pop.isVisible(), true, 'a later hover still shows');
        assert.equal(content(pop), 'works');
      }

      assert.equal(rejections.length, 0, 'no unhandled rejection anywhere in the file');
    } finally {
      process.off('unhandledRejection', onReject);
      clock.restore();
      global.document = realDocument;
      global.window = realWindow;
    }
  },
};
