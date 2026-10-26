'use strict';

// The preview itself: given a target, put the right thing on screen.
//
// Three sources, one shell:
//   code, local   a path on disk, read as a line window
//   code, remote  a raw URL from a repository, fetched and sliced the same way
//   web           a page, optionally narrowed to one heading
//
// The shell (timing, placement, the stale-build guard) is popover.js. What lives here is
// what the reader actually sees.

const { readWindow, sliceLines, langFor } = require('./code');
const { fetchText } = require('./remote');
const { fetchSection } = require('./web');
const { renderCode, renderBlocks } = require('./render');
const { Popover } = require('./popover');
const { t, plural } = require('./i18n');

// The identity of a web target: one page, one string. The host is case-insensitive the way
// DNS is, and a trailing slash names the same page as its absence — a link pasted with
// either spelling must not restart the show timer, and labelFor displays the same identity
// it keys by, so the header never lies about which panel is up.
function urlIdentity(url) {
  const raw = String(url || '');
  const m = /^(https?:\/\/)([^/?#]*)([\s\S]*)$/i.exec(raw);
  if (!m) return raw;
  return m[1] + m[2].toLowerCase() + m[3].replace(/\/+$/, '');
}

// A stable identity for "the thing under the pointer", so moving across the same link
// does not restart the show timer.
//
// A local link carries the note it sits in: `../a.c` means different files from different
// notes, and one identity for both would let the panel built from the first note answer a
// hover in the second.
function keyFor(target, sourcePath) {
  if (target.kind === 'code') {
    return target.source === 'remote'
      ? 'r:' + target.rawUrl + ':' + target.from + '-' + target.to
      : 'l:' + (sourcePath || '') + ':' + target.path + ':' + target.from + '-' + target.to;
  }
  return 'w:' + urlIdentity(target.url) + ':' + (target.heading || '');
}

// A one-line label for the header: where this came from and which lines are shown.
function labelFor(target) {
  if (target.kind === 'code') {
    // A remote snippet names its host: `src/main.c:18` alone reads like a local file, and
    // the reader should be able to tell from the header that the lines came out of a
    // repository. `host` is exactly the field rawUrlFor already resolved.
    const path = target.source === 'remote' && target.host
      ? target.host + ' · ' + target.path
      : target.path;
    const range = target.from === target.to ? ':' + target.from : ':' + target.from + '-' + target.to;
    return path + range;
  }
  const host = urlIdentity(target.url).replace(/^https?:\/\//, '');
  return target.heading ? host + '#' + target.heading : host;
}

class Preview {
  constructor(plugin) {
    this.plugin = plugin;
    this.pop = new Popover({ cls: 'cp-hover', hiddenCls: 'cp-hidden' });
  }

  isVisible() { return this.pop.isVisible(); }
  contains(node) { return this.pop.contains(node); }
  cancelHide() { this.pop.cancelHide(); }
  leave() { this.pop.leave(); }
  hide() { this.pop.hide(); }
  destroy() { this.pop.destroy(); }

  // `sourcePath` is the note the link sits in, so a relative path resolves from the right
  // folder even when several notes are open — and keys as part of the link's identity, so
  // the same spelling in two notes is two previews, not one stale panel.
  schedule(target, sourcePath, x, y) {
    this.pop.schedule(keyFor(target, sourcePath), x, y, (el, ctx) => this.build(target, sourcePath, el, ctx));
  }

  async build(target, sourcePath, el, ctx) {
    el.createDiv({ cls: 'cp-header', text: labelFor(target) });
    const body = el.createDiv({ cls: 'cp-body' });

    if (target.kind === 'code') return this.buildCode(target, sourcePath, body, ctx);

    return this.buildWeb(target, body, ctx);
  }

  async buildCode(target, sourcePath, body, ctx) {
    // Exactly the lines the link names — no context padding. A link says "line 18", so
    // showing line 18 is the whole promise; surrounding lines would be a guess about what
    // else the reader wants.
    const from = target.from;
    const to = target.to;

    let window;
    if (target.source === 'remote') {
      const res = await fetchText(target.rawUrl);
      if (!res.ok) {
        body.createDiv({ cls: 'cp-error', text: t('preview.error.fetch', { error: res.error || 'unknown error' }) });
        return true;
      }
      window = sliceLines(res.text, from, to);
    } else {
      const abs = this.plugin.resolvePath(sourcePath, target.path);
      if (!abs) {
        body.createDiv({ cls: 'cp-error', text: t('preview.error.noPath') });
        return true;
      }
      window = await readWindow(abs, from, to);
    }

    if (!window) {
      body.createDiv({ cls: 'cp-error', text: t('preview.error.nothingAtLine', { line: target.from }) });
      return true;
    }
    if (!ctx.isCurrent()) return false;

    const text = window.lines.join('\n');
    // renderCode owns the tokenizing budget: it draws plain rather than hand Prism a
    // snippet past PRISM_MAX_LINES, so the caller does not pre-check. (The window read
    // off disk is capped far below that line count anyway; a web <pre> is the shape that
    // can exceed it.)
    const lang = langFor(target.path);
    const pre = await renderCode(body, text, lang);
    if (!ctx.isCurrent()) return false;

    // A range wider than the read window (MAX_WINDOW_LINES) shows what fits; saying so is
    // the same honesty the web path practices with its own truncation note.
    if (window.truncated) {
      body.createDiv({ cls: 'cp-note', text: plural('preview.note.truncatedLines', window.lines.length) });
    }

    // Centre the code once the shell has laid the element out. The window is exactly the
    // lines the link named, so the code's middle is the middle of what was asked for.
    return () => {
      body.scrollTop = Math.max(0, pre.offsetTop + pre.offsetHeight / 2 - body.clientHeight / 2);
    };
  }

  async buildWeb(target, body, ctx) {
    const res = await fetchSection(target.url, target.heading);
    if (!ctx.isCurrent()) return false;

    if (res.error) {
      body.createDiv({ cls: 'cp-error', text: t('preview.error.load', { error: res.error }) });
      return true;
    }

    // A heading that is not on the page is reported and nothing else: the reader asked for
    // that section, so the page from the top would be an answer to a different question.
    if (target.heading && res.headingMiss) {
      if (res.title) body.createDiv({ cls: 'cp-page-title', text: res.title });
      body.createDiv({ cls: 'cp-error', text: t('preview.note.headingMiss', { heading: res.missName || target.heading }) });
      return true;
    }

    if (res.title) body.createDiv({ cls: 'cp-page-title', text: res.title });

    const drawn = await renderBlocks(body, res.blocks);
    if (!drawn) body.createDiv({ cls: 'cp-note', text: t('preview.note.empty') });
    if (res.truncated) body.createDiv({ cls: 'cp-note', text: plural('preview.note.truncated', drawn) });
    return true;
  }
}

// Test seam: `keyFor` and `labelFor` are consumed only by test/ (bug22's identity
// contract), as is `isVisible()` on the class (main.js asks the popover nothing it can
// already see); Preview is the API.
module.exports = { Preview, keyFor, labelFor };
