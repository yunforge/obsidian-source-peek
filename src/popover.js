'use strict';

// The preview shell: when to show, where to put it, and how to keep a slow build from
// landing on top of a newer one.
//
// This is our own floating element rather than Obsidian's HoverPopover, which hides the
// moment the pointer leaves the link. Here the reader can move into the preview, scroll
// it, and select the text — which is the whole point of previewing code.

const SHOW_DELAY = 200; // ms the pointer must rest on a link before anything appears
const HIDE_GRACE = 250; // ms of grace for the pointer to travel from link to preview
const EDGE_PAD = 12; // px kept between the preview and the window edge

class Popover {
  constructor(opts) {
    const o = opts || {};
    this.cls = o.cls || 'cp-popover';
    this.hiddenCls = o.hiddenCls || 'cp-hidden';
    this.showDelay = o.showDelay == null ? SHOW_DELAY : o.showDelay;
    this.hideGrace = o.hideGrace == null ? HIDE_GRACE : o.hideGrace;

    this.el = null;
    this.timer = null;
    this.hideTimer = null;
    this.key = '';
    // What `schedule()` is waiting to show, or null once nothing is waiting. Kept as the
    // whole request so the caller can ask whether a preview is on its way and withdraw it.
    this.pending = null;
    // Every build carries the token it was started under; a build that finishes after a
    // newer one began (or after the pointer left) sees a stale token and discards itself.
    this.token = 0;
  }

  ensureEl() {
    if (!this.el) {
      this.el = document.body.createDiv({ cls: this.cls + ' ' + this.hiddenCls });
      this.el.addEventListener('mouseenter', () => this.cancelHide());
      this.el.addEventListener('mouseleave', () => this.leave());
    }
    return this.el;
  }

  isVisible() {
    return !!this.el && !this.el.classList.contains(this.hiddenCls);
  }

  contains(node) {
    return !!this.el && !!node && this.el.contains(node);
  }

  cancelHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  // Whether a preview is on its way but not yet on screen. `isVisible()` cannot answer
  // this: during the show delay the element does not exist at all.
  isPending() {
    return !!this.pending;
  }

  // Withdraw a preview that has not appeared yet. Clearing the timer is the essential
  // half — the pending record follows it, so the next hover starts from scratch.
  cancelPending() {
    clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }

  // Re-asking for what is already up, or already on its way, changes nothing — otherwise
  // every mouse move across the same link would restart the timer.
  schedule(key, x, y, build) {
    this.cancelHide();
    if (key === this.key && this.isVisible()) return;
    if (this.pending && this.pending.key === key) return;
    this.cancelPending();
    this.pending = { key, x, y, build };
    this.timer = setTimeout(() => {
      const p = this.pending;
      this.timer = null;
      this.pending = null;
      if (p) this.show(p.key, p.x, p.y, p.build);
    }, this.showDelay);
  }

  // The pointer left. Both halves matter: a preview already up gets its grace period, and
  // a preview still waiting for its delay is dropped outright — otherwise the panel would
  // appear after the pointer had gone, and the grace period (longer than the delay) would
  // not take it back off the screen until it had already been seen.
  leave() {
    this.cancelPending();
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, this.hideGrace);
  }

  async show(key, x, y, build) {
    const token = ++this.token;
    const ctx = { isCurrent: () => token === this.token };
    const el = this.ensureEl();
    el.empty();

    // A build can give up three ways: by answering `false`, by being overtaken, or by
    // throwing. The third used to fall through untouched: `show` itself rejected (an
    // unhandled rejection, and nothing tidied the panel), the element kept whatever the
    // build had drawn before it threw, and `this.key` still named the older content — so
    // `schedule()`'s same-key early return answered "already up" for the panel that had
    // just died, and hovering that link again never rebuilt it. A thrown build is the
    // build saying "I cannot draw this"; it is handled exactly like `false`. (Prism's
    // tokenizer on a pathological snippet is the realistic thrower.)
    let after;
    try {
      after = await build(el, ctx);
    } catch {
      after = false;
    }
    // The build gave up: it found nothing worth drawing (`after === false`), or a newer build
    // took the panel over first. `el` was emptied before the build began, so by now the panel
    // is a bare frame, and `this.key` still names the content that frame used to hold.
    // Left alone those two are the bug: a visible panel with nothing in it, and a key that
    // makes `schedule()` answer "the same link is already up" the next time the pointer comes
    // back — so the preview that was there never returns.
    if (after === false || !ctx.isCurrent()) {
      // Only the build that still owns the token may tidy up. When a newer build has taken
      // over it is drawing into this same element and owns `this.key`; emptying either one
      // here would throw that newer content away.
      if (ctx.isCurrent()) {
        // Back to how a panel with nothing in it should look: hidden, empty, claiming no key.
        // Both steps are safe on a panel that was already hidden (a first build that failed
        // before anything was ever shown) — the class is already there and there is nothing
        // in the element to empty.
        this.key = '';
        el.addClass(this.hiddenCls);
        el.empty();
      }
      return;
    }

    this.key = key;
    // Measured while hidden but laid out, so the flip decisions below see real dimensions.
    el.style.visibility = 'hidden';
    el.style.left = '-9999px';
    el.style.top = '0px';
    el.removeClass(this.hiddenCls);
    if (typeof after === 'function') after();

    const r = el.getBoundingClientRect();
    let left = x + EDGE_PAD;
    let top = y + EDGE_PAD;
    if (left + r.width > window.innerWidth - EDGE_PAD) {
      left = Math.max(EDGE_PAD, x - EDGE_PAD - r.width);
    }
    if (top + r.height > window.innerHeight - EDGE_PAD) {
      top = Math.max(EDGE_PAD, y - EDGE_PAD - r.height);
    }
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.visibility = 'visible';
  }

  hide() {
    this.cancelPending();
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.key = '';
    this.token++;
    if (this.el) {
      this.el.addClass(this.hiddenCls);
      this.el.empty();
    }
  }

  destroy() {
    this.cancelPending();
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.token++;
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }
}

// EDGE_PAD stays module-internal: the placement code is its only consumer.
// Test seam: `SHOW_DELAY` and `HIDE_GRACE`, and `isPending()` on the class, are consumed
// only by test/ (production asks `schedule` to decide, never polls the state).
module.exports = { Popover, SHOW_DELAY, HIDE_GRACE };
