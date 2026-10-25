'use strict';

// What a build that gives up leaves behind.
//
// `show()` empties the panel before it asks for content, so a build that returns `false` —
// "there is nothing to draw here" — used to leave a panel that was still on screen and now
// held nothing, with `this.key` still naming the preview that used to be in it. `schedule()`
// then answered "that link is already up" for the old link, and the preview never came back.
//
// The same fake DOM and fake clock as popover.test.js: the shell under test must not need any
// DOM API beyond what is implemented here.

const assert = require('assert/strict');
const { Popover, SHOW_DELAY } = require('../src/popover');

// --- a DOM small enough to reason about -----------------------------------

// The same element as test/popover.test.js, plus `text` — the only addition, and it mirrors
// the real `createDiv({ cls, text })` signature rather than inventing a new one.
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
    // Obsidian's `createDiv({ cls })` accepts a space-separated list, and `ensureEl()` passes
    // one ('cp-popover cp-hidden'). Splitting it here is what makes `isVisible()` mean
    // something: with the whole string stored as one token, `contains('cp-hidden')` would
    // always be false and every element would look visible.
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

// --- a clock that moves only when a test moves it -------------------------

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

// `show()` awaits the build, so a fake timer firing only starts it; the rest of the work
// lands in the microtask queue. Draining it with a real macrotask is the whole proof that the
// sequence a reader sees has finished.
const settle = () => new Promise((resolve) => setImmediate(resolve));

// What the panel currently holds, as the test's build wrote it.
function content(pop) {
  if (!pop.el) return '';
  return pop.el.children.map((c) => c.text || '').join('');
}

// A build the test controls by hand: it draws `text` and succeeds. Cases that need a build
// to give up write that build inline, because the way it fails is the thing under test.
function draw(text) {
  return (el) => {
    el.createDiv({ cls: 'cp-body', text });
    return true;
  };
}

module.exports = {
  name: 'popover: a build that gives up hands the panel back',
  async run() {
    const realDocument = global.document;
    const realWindow = global.window;
    const clock = installClock();
    global.document = { body: new El('body'), addEventListener() {} };
    global.window = { innerWidth: 1200, innerHeight: 800, addEventListener() {} };

    try {
      // --- 1. the reported sequence: A, a failed B, and back to A ---
      // Before the fix this ended with a visible, empty panel that claimed key 'A' — so the
      // third step never rebuilt and the reader's preview was gone for good.
      {
        const pop = new Popover();

        pop.schedule('A', 10, 20, draw('A-content'));
        clock.advance(SHOW_DELAY);
        await settle();
        assert.equal(pop.isVisible(), true, 'A is on screen');
        assert.equal(pop.key, 'A', 'and the panel says which link it holds');
        assert.equal(content(pop), 'A-content');

        // B has nothing to draw, so its build gives up after the panel was already emptied.
        let bBuilds = 0;
        pop.schedule('B', 10, 20, (el) => { bBuilds++; return false; });
        clock.advance(SHOW_DELAY);
        await settle();
        assert.equal(bBuilds, 1, 'B was attempted');
        assert.equal(pop.key, '', 'the panel no longer claims A: that content is gone');
        assert.equal(pop.isVisible(), false, 'and it is not left standing there empty');
        assert.equal(content(pop), '', 'the empty panel holds nothing');

        // Back to A: the guard in schedule() must not swallow the request this time.
        pop.schedule('A', 10, 20, draw('A-content'));
        clock.advance(SHOW_DELAY);
        await settle();
        assert.equal(pop.isVisible(), true, 'A comes back');
        assert.equal(pop.key, 'A');
        assert.equal(content(pop), 'A-content', 'with its content, not an empty frame');
      }

      // --- 2. a build that gives up while the panel has never been shown ---
      // The panel does not exist during the show delay, and `show()` creates it before it
      // asks for content. A first build that fails therefore meets an element that is
      // already hidden and already empty: cleaning up must not turn visibility inside out.
      {
        const pop = new Popover();
        pop.schedule('X', 10, 20, () => false);
        clock.advance(SHOW_DELAY);
        await settle();

        assert.notEqual(pop.el, null, 'the element was created by this attempt');
        assert.equal(pop.isVisible(), false, 'and it is hidden, never shown empty');
        assert.equal(pop.el.classList.contains('cp-hidden'), true, 'the hidden class is still on');
        assert.equal(content(pop), '', 'and there is nothing in it');
        assert.equal(pop.key, '');

        // The panel is usable afterwards: the failure left no state behind.
        pop.schedule('Y', 10, 20, draw('Y-content'));
        clock.advance(SHOW_DELAY);
        await settle();
        assert.equal(pop.isVisible(), true, 'a later hover still shows');
        assert.equal(pop.key, 'Y');
        assert.equal(content(pop), 'Y-content');
      }

      // --- 3. an overtaken build gives up, and must leave the newer panel alone ---
      // The second half of the bail condition: the token went stale because a newer show
      // took over. That newer show owns the element and the key now, so tidying up here
      // would empty the panel the reader is looking at.
      {
        const pop = new Popover();
        let releaseA;
        const gate = new Promise((r) => { releaseA = r; });

        pop.schedule('A', 10, 20, async (el) => {
          el.createDiv({ cls: 'cp-body', text: 'A-content' });
          await gate;
          return true; // even a build that would have succeeded is stale by now
        });
        clock.advance(SHOW_DELAY);
        await settle();

        // While A is still waiting on its (slow) source, the pointer moves to B and B wins.
        pop.schedule('B', 10, 20, draw('B-content'));
        clock.advance(SHOW_DELAY);
        await settle();
        assert.equal(pop.key, 'B');

        releaseA();
        await settle();
        assert.equal(pop.key, 'B', 'the stale build does not take the key back');
        assert.equal(pop.isVisible(), true, 'and does not hide the newer panel');
        assert.equal(content(pop), 'B-content', 'nor empty it');
      }

      // --- 4. the same, but the overtaken build reports failure ---
      {
        const pop = new Popover();
        let releaseA;
        const gate = new Promise((r) => { releaseA = r; });

        pop.schedule('A', 10, 20, async (el) => {
          el.createDiv({ cls: 'cp-body', text: 'A-content' });
          await gate;
          return false; // both halves of the bail condition at once
        });
        clock.advance(SHOW_DELAY);
        await settle();

        pop.schedule('B', 10, 20, draw('B-content'));
        clock.advance(SHOW_DELAY);
        await settle();

        releaseA();
        await settle();
        assert.equal(pop.key, 'B', 'a stale failure leaves the newer key alone');
        assert.equal(pop.isVisible(), true);
        assert.equal(content(pop), 'B-content', 'and leaves the newer content alone');
      }

      // --- 5. the successful path is untouched ---
      // Key, the hidden-then-visible layout pass, the edge flip and the `after` callback all
      // still happen exactly as before.
      {
        const pop = new Popover();
        const seen = [];
        pop.schedule('S', 10, 20, (el) => {
          // Still unpositioned: the layout pass runs after the build, not before it.
          seen.push('build-unpositioned:' + (el.style.visibility === undefined));
          el.createDiv({ cls: 'cp-body', text: 'S-content' });
          // ...and `after` runs in the measuring pass, with the panel hidden but laid out.
          return () => seen.push('after-measuring:' + (el.style.visibility === 'hidden'));
        });
        clock.advance(SHOW_DELAY);
        await settle();

        assert.equal(pop.key, 'S');
        assert.equal(pop.isVisible(), true);
        assert.equal(content(pop), 'S-content');
        assert.deepEqual(
          seen,
          ['build-unpositioned:true', 'after-measuring:true'],
          'built first, then measured hidden, then shown',
        );
        assert.equal(pop.el.style.visibility, 'visible', 'shown once it is positioned');
        assert.equal(pop.el.style.left, '22px', 'x + EDGE_PAD when the panel fits');
        assert.equal(pop.el.style.top, '32px', 'y + EDGE_PAD when the panel fits');

        // The same link, asked for again, is already up: no rebuild.
        let rebuilds = 0;
        pop.schedule('S', 10, 20, () => { rebuilds++; return true; });
        clock.advance(SHOW_DELAY * 2);
        await settle();
        assert.equal(rebuilds, 0, 'a repeated request for the same link does not rebuild');
        assert.equal(pop.key, 'S');
      }

      // --- 6. the flip at the far edge still flips ---
      {
        const pop = new Popover();
        pop.schedule('E', 1100, 700, draw('E-content'));
        clock.advance(SHOW_DELAY);
        await settle();
        // 1100 + 12 + 300 > 1188, so the panel goes to the left of the pointer; likewise
        // 700 + 12 + 120 > 788 puts it above.
        assert.equal(pop.el.style.left, '788px', 'flipped left at the right edge');
        assert.equal(pop.el.style.top, '568px', 'flipped up at the bottom edge');
      }
    } finally {
      clock.restore();
      global.document = realDocument;
      global.window = realWindow;
    }
  },
};
