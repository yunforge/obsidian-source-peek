'use strict';

// The popover shell: when a preview appears, when it goes away, and what happens when the
// pointer changes its mind in between.
//
// This is a zero-coverage corner that held a real bug. `schedule()` sets a 200 ms show timer,
// and the callers used to ask `isVisible()` before letting go — a question that is false
// during those 200 ms, so the timer survived and the panel appeared after the pointer had
// already left. Two fake objects make the timing visible: a DOM small enough to reason about
// and a clock that only moves when a test says so.

const assert = require('assert/strict');
const Module = require('module');
const { SHOW_DELAY, HIDE_GRACE } = require('../src/popover');

// --- a DOM small enough to reason about -----------------------------------

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
    if (o && o.cls) el.classList.add(o.cls);
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
  fire(type, evt) { (this.listeners[type] || []).forEach((fn) => fn(evt || {})); }
  getBoundingClientRect() { return { width: 300, height: 120, left: 0, top: 0 }; }
  remove() {}
}

// --- a clock that moves only when a test moves it -------------------------

// Installs fake `setTimeout`/`clearTimeout` on globalThis (the shell under test is plain
// CommonJS, so it reaches them as globals) and hands back a harness. The harness drives the
// same sequence the real browser would: timers fire in due order, no earlier and no later.
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
    // Everything still waiting to fire, in due order — the only way a test can prove that a
    // timer was *cleared* rather than merely not yet due.
    due() { return timers.map((t) => t.due).sort((a, b) => a - b); },
    // A show timer fires at most `showDelay` from now; a hide timer armed by leave() fires
    // later (the grace period is longer). Counting the timers due within one show delay
    // therefore counts exactly the shows that are still armed.
    showsArmed() { return this.due().filter((d) => d <= this.now + SHOW_DELAY).length; },
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

// --- a DOM element that looks like a link under the pointer ---------------

// `hitAt()` reads the nearest <a>, its href, and whether the plugin's document listeners saw
// a mousedown (it hides the preview on one) — no more. A stub that answers those is enough
// to drive main.js's real pointer handling.
function fakeLink(href) {
  return {
    tagName: 'A',
    href: href || '',
    getAttribute(name) { return name === 'href' ? this.href : null; },
    contains(other) { return other === this; },
    classList: { add() {}, remove() {}, contains: () => false },
  };
}

module.exports = {
  name: 'popover: the show delay, and what happens when the pointer leaves early',
  async run() {
    const realDocument = global.document;
    const realWindow = global.window;
    const clock = installClock();
    global.document = { body: new El('body'), addEventListener() {} };
    global.window = { innerWidth: 1200, innerHeight: 800, addEventListener() {} };

    const realLog = console.error;
    console.error = () => {};
    // `main.js` is a plugin module and refuses to load without Obsidian's own module. Its
    // class is what these tests exercise, so the module is stubbed out for the load.
    const origLoad = Module._load;
    Module._load = function (request) {
      if (request === 'obsidian') {
        return {
          Plugin: class {},
          PluginSettingTab: class {},
          Setting: class {},
          MarkdownView: class {},
          Notice: class {},
          editorLivePreviewField: {},
        };
      }
      return origLoad.apply(this, arguments);
    };
    let HoverPreviewPlugin;
    try {
      HoverPreviewPlugin = require('../src/main');
    } finally {
      Module._load = origLoad;
      console.error = realLog;
    }

    const { Popover } = require('../src/popover');

    // What the fixed callers do: no question asked, just let go. `main.js` reaches this same
    // unconditional `preview.leave()` through `leavePreview()`.
    const release = (prev) => prev.leave();

    try {
      // --- 1. the pointer leaves inside the show delay: nothing must appear ---
      // The bug: at this point `isVisible()` is false, the old callers returned without
      // calling leave(), the show timer survived, and the panel appeared at t = SHOW_DELAY
      // with the pointer long gone. This test fails on the unfixed code.
      {
        let builds = 0;
        const pop = new Popover();
        pop.schedule('l:a.c:1-2', 10, 20, () => { builds++; return true; });

        assert.equal(pop.isVisible(), false, 'nothing is on screen yet');
        assert.equal(pop.isPending(), true, 'a preview is waiting out its show delay');

        clock.advance(150);
        release(pop);

        assert.equal(pop.isPending(), false, 'an unconditional leave() drops the waiting preview');
        assert.equal(clock.showsArmed(), 0, 'no show timer is left armed');

        clock.advance(1000);
        assert.equal(builds, 0, 'the build never ran: nothing to draw for a pointer that left');
        assert.equal(pop.isVisible(), false, 'the panel never appeared');
      }

      // --- 2. leaving in the last millisecond before the delay: still nothing ---
      // The 200 ms show timer and the 250 ms hide timer are what used to be confused: an
      // unconditional leave() alone left the show timer armed, and it fired first.
      {
        let builds = 0;
        const pop = new Popover();
        pop.schedule('l:b.c:3', 10, 20, () => { builds++; return true; });
        clock.advance(SHOW_DELAY - 1);
        release(pop);
        clock.advance(2000);
        assert.equal(builds, 0, 'a leave() one tick before the delay still cancels the show');
        assert.equal(pop.isVisible(), false, 'and the panel stays away');
      }

      // --- 3. a normal hover: it appears, and goes once the grace period is over ---
      {
        let builds = 0;
        const pop = new Popover();
        pop.schedule('l:c.c:5-6', 10, 20, () => { builds++; return true; });

        clock.advance(SHOW_DELAY - 1);
        assert.equal(pop.isVisible(), false, 'still waiting 1 ms before the delay ends');
        clock.advance(1);
        assert.equal(pop.isVisible(), true, 'visible once the pointer has rested for the delay');
        assert.equal(builds, 1, 'the preview was built exactly once');
        assert.equal(pop.isPending(), false, 'nothing is pending once it is on screen');

        release(pop);
        clock.advance(HIDE_GRACE - 1);
        assert.equal(pop.isVisible(), true, 'the grace period is honoured, so the reader can move in');
        clock.advance(1);
        assert.equal(pop.isVisible(), false, 'and it goes when the grace period ends');
      }

      // --- 4. moving from the link to the preview is not leaving it ---
      {
        const pop = new Popover();
        pop.schedule('l:d.c:9', 10, 20, () => true);
        clock.advance(SHOW_DELAY);
        release(pop);
        clock.advance(HIDE_GRACE - 40);
        pop.cancelHide();
        clock.advance(2000);
        assert.equal(pop.isVisible(), true, 'the pointer reaching the preview keeps it up');
      }

      // --- 5. hide() also drops a waiting preview ---
      {
        let builds = 0;
        const pop = new Popover();
        pop.schedule('l:e.c:2', 10, 20, () => { builds++; return true; });
        pop.hide();
        clock.advance(2000);
        assert.equal(builds, 0, 'hide() cancels the pending show, not just the visible panel');
        assert.equal(pop.isPending(), false, 'and forgets the request');
      }

      // --- 6. asking again for the same link does not restart the delay ---
      {
        let builds = 0;
        const pop = new Popover();
        const build = () => { builds++; return true; };
        pop.schedule('l:f.c:4', 10, 20, build);
        clock.advance(100);
        pop.schedule('l:f.c:4', 10, 20, build);
        clock.advance(100);
        assert.equal(pop.isVisible(), true, 'a mouse move on the same link leaves the timer alone');
        assert.equal(builds, 1);
      }

      // --- 7. the real caller (mouseout): a pointer that leaves must not show anything ---
      // Driven through src/main.js rather than the shell, because the bug lived in the call
      // site: `if (this.preview.isVisible()) this.preview.leave();` skipped the leave()
      // entirely while the preview was still invisible.
      {
        const plugin = Object.create(HoverPreviewPlugin.prototype);
        plugin.settings = { enabled: true, hoverModifier: 'none' };
        plugin.held = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
        plugin.pointer = null;
        plugin.preview = new (require('../src/preview').Preview)(plugin);

        const anchor = fakeLink('../src/a.c#L1-2');
        const elsewhere = new El('div');
        plugin.app = {
          vault: { adapter: { getBasePath: () => '' } },
          workspace: { getActiveViewOfType: () => null },
        };

        // Counting the build itself, not the schedule call: what matters is whether
        // anything was drawn.
        let builds = 0;
        plugin.preview.build = async () => { builds++; return true; };

        plugin.onPointerMove({ target: anchor, clientX: 30, clientY: 40 });
        assert.equal(plugin.preview.pop.isPending(), true, 'the hover armed a preview');

        // The pointer leaves the link for some other element, inside the show delay.
        plugin.onPointerOut({ target: anchor, relatedTarget: elsewhere });
        clock.advance(2000);

        assert.equal(builds, 0, 'main.js lets go of a pending preview: nothing is built');
        assert.equal(plugin.preview.isVisible(), false, 'and nothing appears after the pointer left');
      }

      // --- 7b. a move off the link, with no mouseout to rely on ---
      // Live Preview has no element for the link to leave, and a mouseout only fires on an
      // element boundary — so mousemove is the only signal there, and it must be enough on
      // its own. Here the shell is fixed but `evaluate()` still guards its leave() with
      // `isVisible()`, which is false during the delay: the panel appears after the pointer
      // has gone. This is the caller-side half of the bug, tested on its own.
      {
        const plugin = Object.create(HoverPreviewPlugin.prototype);
        plugin.settings = { enabled: true, hoverModifier: 'none' };
        plugin.held = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
        plugin.pointer = null;
        plugin.preview = new (require('../src/preview').Preview)(plugin);

        const anchor = fakeLink('../src/d.c#L1-2');
        const blank = new El('div');
        plugin.app = {
          vault: { adapter: { getBasePath: () => '' } },
          workspace: { getActiveViewOfType: () => null },
        };

        let builds = 0;
        plugin.preview.build = async () => { builds++; return true; };

        plugin.onPointerMove({ target: anchor, clientX: 30, clientY: 40 });
        clock.advance(150);
        assert.equal(plugin.preview.pop.isPending(), true, 'still inside the show delay');

        // Same pointer, now off the link: a move alone, no mouseout.
        plugin.onPointerMove({ target: blank, clientX: 5, clientY: 5 });
        clock.advance(2000);

        assert.equal(builds, 0, 'a move off the link drops the pending preview');
        assert.equal(plugin.preview.isVisible(), false, 'nothing appears after the pointer left');
      }

      // --- 8. the same caller still previews a real hover ---
      {
        const plugin = Object.create(HoverPreviewPlugin.prototype);
        plugin.settings = { enabled: true, hoverModifier: 'none' };
        plugin.held = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
        plugin.pointer = null;
        plugin.preview = new (require('../src/preview').Preview)(plugin);

        const anchor = fakeLink('../src/b.c#L1-2');
        const blank = new El('div');
        plugin.app = {
          vault: { adapter: { getBasePath: () => '' } },
          workspace: { getActiveViewOfType: () => null },
        };

        let builds = 0;
        plugin.preview.build = async () => { builds++; return true; };

        plugin.onPointerMove({ target: anchor, clientX: 30, clientY: 40 });
        clock.advance(SHOW_DELAY);
        assert.equal(builds, 1, 'a full hover builds the preview');
        assert.equal(plugin.preview.isVisible(), true, 'and it is on screen');

        // The pointer leaves into the blank space beside the link and keeps moving. A move
        // on its own has to withdraw the panel: in Live Preview there is no element whose
        // mouseout could do it, and while the preview is visible `evaluate()` used to skip
        // its leave() because nothing restarted the hover.
        plugin.onPointerMove({ target: blank, clientX: 5, clientY: 5 });
        clock.advance(HIDE_GRACE);
        assert.equal(plugin.preview.isVisible(), false, 'a move off the visible link hides it');

        plugin.onPointerOut({ target: anchor, relatedTarget: null });
        clock.advance(HIDE_GRACE);
        assert.equal(plugin.preview.isVisible(), false, 'leaving the link takes it away');
      }

      // --- 9. moving between the pieces of one link is not leaving it ---
      {
        const plugin = Object.create(HoverPreviewPlugin.prototype);
        plugin.settings = { enabled: true, hoverModifier: 'none' };
        plugin.held = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
        plugin.pointer = null;
        plugin.preview = new (require('../src/preview').Preview)(plugin);
        plugin.app = { vault: { adapter: { getBasePath: () => '' } }, workspace: { getActiveViewOfType: () => null } };

        const anchor = fakeLink('../src/c.c#L1-2');
        const inner = { parentElement: anchor, tagName: 'CODE' };
        anchor.contains = function (other) { return other === this || other === inner; };

        plugin.onPointerMove({ target: anchor, clientX: 30, clientY: 40 });
        clock.advance(SHOW_DELAY);
        assert.equal(plugin.preview.isVisible(), true);

        // The pointer crosses from the anchor into its own child: relatedTarget is inside.
        plugin.onPointerOut({ target: anchor, relatedTarget: inner });
        clock.advance(HIDE_GRACE * 2);
        assert.equal(plugin.preview.isVisible(), true, 'a pointer inside one link has not left it');
      }
    } finally {
      clock.restore();
      global.document = realDocument;
      global.window = realWindow;
    }
  },
};
