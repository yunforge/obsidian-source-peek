'use strict';

// Source Peek for Obsidian.
//
// The whole plugin is one gesture: rest the pointer on a link and read what it points
// at. Two things can be pointed at — a range of lines in a source file, or a heading's
// worth of a web page — and both are spelled the way GitHub spells them:
//
//   [the parser](../src/main.c#L18)                                   one line, local file
//   [the loop](../src/main.c#L18-23)                                  a range, local file
//   [upstream](https://github.com/o/r/blob/main/src/main.c#L18-L23)   a file in a repo
//   [install](https://example.com/page#install)                       one heading of a page
//
// Everything the plugin used to do — indexing, autocomplete, embeds, pinning — is gone.
// What is left is the preview.

const { Plugin, MarkdownView, Notice, editorLivePreviewField } = require('obsidian');
const nodePath = require('path');
const { parseTarget, findTargets } = require('./parse');
const { Preview } = require('./preview');
const { resolveLocal } = require('./code');
const { DEFAULT_SETTINGS } = require('./constants');
const { HoverPreviewSettingTab } = require('./settings-tab');
const { initI18n, t } = require('./i18n');
const { pointerOverPos } = require('./pointer');
const { shouldPreview, needsKey } = require('./modifier');
const { codeLinkFixes } = require('./link-mark');

// The keys whose press or release can complete a hover. Named by `evt.key`, which is what a
// keydown reports.
const isModifierKey = (key) => key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta';

class HoverPreviewPlugin extends Plugin {
  async onload() {
    // Before anything else: every string the plugin shows is looked up through this, so
    // the language has to be settled before the first one is asked for.
    initI18n();

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.preview = new Preview(this);

    // One delegated listener over the document serves both surfaces, and costs nothing
    // until a pointer actually moves.
    this.registerDomEvent(document, 'mousemove', (evt) => this.onPointerMove(evt));
    this.registerDomEvent(document, 'mouseout', (evt) => this.onPointerOut(evt));

    // A preview floats over the editor, so anything that moves the world under it should
    // take it away: a scroll, a blur, Escape, or a click landing elsewhere.
    this.registerDomEvent(document, 'scroll', (evt) => {
      if (!this.preview.contains(evt.target)) this.preview.hide();
    }, { capture: true });
    this.registerDomEvent(window, 'blur', () => this.preview.hide());

    // A modifier pressed while the pointer rests still — no mousemove follows, so without
    // this the preview would only ever appear if the key came first. Escape dismisses.
    this.registerDomEvent(document, 'keydown', (evt) => {
      if (evt.key === 'Escape') {
        this.preview.hide();
        return;
      }
      if (isModifierKey(evt.key)) this.onModifierChange(evt);
    }, { capture: true });
    this.registerDomEvent(document, 'keyup', (evt) => {
      if (isModifierKey(evt.key)) this.onModifierChange(evt);
    }, { capture: true });
    this.registerDomEvent(document, 'mousedown', (evt) => {
      if (!this.preview.contains(evt.target)) this.preview.hide();
    });

    // Obsidian's own Page preview answers every link it is told about, and it decides what
    // a link is by its class: `internal-link` means "look this up in the vault". A code
    // link is not in the vault — it is a path on disk — so Page preview would search for
    // it, fail, and show its own "not found" popover on top of ours. Reclassifying the
    // link as external takes it out of Page preview's hands entirely.
    this.registerMarkdownPostProcessor((el) => this.markCodeLinks(el));

    // Live Preview has no <a> to reclassify. Obsidian parses the line itself and hangs a
    // `mouseover` delegate on `.cm-hmd-internal-link` spans; when one fires it hands the
    // text to Page preview, which looks the path up in the vault, does not find it (it is a
    // file on disk), and shows its own "not found" popover beside ours.
    //
    // Reclassifying cannot reach that, and stopping the `hover-link` event afterwards is too
    // late — Page preview has already been told. So the mouseover is stopped in the capture
    // phase, before Obsidian's delegate sees it, and only when the *source line* under the
    // pointer holds a code target. The span's own text is no use here: Live Preview shows
    // the link's display text, not its destination.
    this.registerDomEvent(
      document,
      'mouseover',
      (evt) => {
        if (!evt.target || !evt.target.closest) return;
        const span = evt.target.closest('.cm-hmd-internal-link, .cm-link');
        if (!span) return;
        if (!this.pointerOnCodeLink(evt)) return;
        // This is a code link: ours to preview, not the vault's to look up.
        evt.stopPropagation();
        // Live Preview's link span carries an `aria-label` that Obsidian turns into a
        // "Follow link" tooltip after a hover rests. It is set by the editor, so it is
        // cleared here rather than in a post-processor — and clearing it before the
        // tooltip timer starts is what stops the tooltip appearing at all.
        span.removeAttribute('aria-label');
        span.removeAttribute('data-tooltip-position');
        span.removeAttribute('data-tooltip-delay');
      },
      { capture: true },
    );

    this.addSettingTab(new HoverPreviewSettingTab(this.app, this));

    this.addCommand({
      id: 'toggle-hover-preview',
      name: t('cmd.toggle'),
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
        if (!this.settings.enabled) this.preview.hide();
        new Notice(t(this.settings.enabled ? 'notice.on' : 'notice.off'));
      },
    });
  }

  onunload() {
    if (this.preview) this.preview.destroy();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // The vault's folder on disk. `getBasePath` lives on the adapter, not on the vault —
  // calling it on the vault silently yields undefined, and every relative path then
  // resolves against the process's working directory instead of the notes.
  vaultPath() {
    const adapter = this.app && this.app.vault && this.app.vault.adapter;
    if (adapter && typeof adapter.getBasePath === 'function') {
      return adapter.getBasePath();
    }
    return '';
  }

  // The absolute path a code link names, or null when it points outside the vault.
  //
  // The vault is the whole world here: `./src/main.rs` resolves from the note holding the
  // link, `/src/main.rs` from the vault root, and anything that climbs above the vault is
  // refused rather than read. Code outside the vault is linked as a repository URL, which
  // is a web link and goes through the fetch path instead.
  resolvePath(sourcePath, targetPath) {
    const vault = this.vaultPath();
    if (!vault) return null;
    const noteDir = sourcePath
      ? nodePath.join(vault, nodePath.dirname(sourcePath) === '.' ? '' : nodePath.dirname(sourcePath))
      : vault;
    return resolveLocal(targetPath, noteDir, vault);
  }

  // ---------------------------------------------------------------- pointer handling

  // The pointer moved. Whether that is enough to preview depends on the surface and on the
  // reader's setting, which `evaluate` decides.
  onPointerMove(evt) {
    if (!this.settings.enabled) return;
    // A pointer inside the preview itself is the reader reading; leave it alone.
    if (this.preview.contains(evt.target)) {
      this.preview.cancelHide();
      return;
    }
    // Where the pointer is now. Kept because a modifier key can be pressed while the pointer
    // rests still — no mousemove follows, so the key press has to re-ask this position.
    this.pointer = { x: evt.clientX, y: evt.clientY, target: evt.target };
    this.rememberModifiers(evt);
    this.evaluate(evt);
  }

  // Whether to show, hide, or keep waiting — the single place that decides.
  //
  // Two surfaces, two rules, and the difference is Obsidian's own: its page preview fires on
  // a plain hover in reading view and waits for the modifier in the editor. Matching that
  // means the key is never needed where the reader is only reading, and is needed exactly
  // where they are editing and a stray panel would be in the way.
  evaluate(evt) {
    const hit = this.hitAt(evt);
    if (!hit) {
      this.leavePreview();
      return;
    }

    if (needsKey(hit.surface) && !this.modifierHeld()) {
      this.leavePreview();
      return;
    }

    this.preview.cancelHide();
    this.preview.schedule(hit.target, hit.sourcePath, evt.clientX, evt.clientY);
  }

  // There is nothing to preview at the pointer, so let go of whatever is up or on its way.
  // Deliberately unconditional: while a preview waits out its show delay it is not visible
  // yet, and asking "is it visible?" before letting go is exactly how a preview used to
  // appear after the pointer had already left.
  leavePreview() {
    this.preview.leave();
  }

  // A modifier key went down or up. Only a press matters: it may complete a hover that the
  // pointer began on its own, which is the order a reader naturally does it in — rest on the
  // link, then reach for the key.
  onModifierChange(evt) {
    if (!this.settings.enabled) return;
    if (!this.pointer) return;
    this.rememberModifiers(evt);
    // A release is left alone: the preview stays until the pointer leaves, rather than
    // vanishing the moment a finger lifts.
    if (!this.modifierHeld()) return;
    if (!this.pointer.target) return;
    this.evaluate({
      clientX: this.pointer.x,
      clientY: this.pointer.y,
      target: this.pointer.target,
    });
  }

  // The modifier flags carried by an event, kept as plain state. Mouse events are
  // authoritative while the pointer moves; key events are what tell us about a key pressed
  // with the pointer still.
  rememberModifiers(evt) {
    this.held = {
      ctrlKey: !!evt.ctrlKey,
      shiftKey: !!evt.shiftKey,
      altKey: !!evt.altKey,
      metaKey: !!evt.metaKey,
    };
  }

  // Whether the key the reader chose for previewing is down right now.
  modifierHeld() {
    const s = this.settings;
    return shouldPreview(this.held || {}, s.hoverModifier, s.hoverModifiers, this.isMac());
  }

  // Whether the source line under the pointer holds a code target — used to keep Obsidian's
  // own Page preview from answering a link that is ours.
  pointerOnCodeLink(evt) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view && view.editor && view.editor.cm;
    if (!cm) return false;
    let pos;
    try {
      pos = cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
    } catch {
      return false;
    }
    if (pos == null) return false;
    // `posAtCoords` snaps to the nearest character, so a pointer out in the blank space
    // right of a line still reports the line's last position — which, on a line ending in
    // a link, is the link. editorHit demands the snapped character really be under the
    // pointer before it answers; this path stops other plugins' mouseover handling in the
    // capture phase, so the same proof is needed before their events are touched.
    if (!pointerOverPos(cm, pos, evt)) return false;
    const line = cm.state.doc.lineAt(pos);
    const col = pos - line.from;
    // The specific link under the pointer, not merely "this line has one": a line can hold
    // a vault link and a code link, and only the code link is ours to keep.
    return findTargets(line.text).some((hit) => col >= hit.hitStart && col <= hit.hitEnd);
  }

  // Cmd rather than Ctrl on a Mac: that is the key Obsidian itself uses, so a Mac reader
  // gets the behaviour they already know.
  isMac() {
    const platform = (typeof process !== 'undefined' && process.platform) || '';
    return platform === 'darwin';
  }

  // The pointer left a link. This used to be skipped whenever the preview was not visible,
  // which is precisely the moment it mattered: a preview still inside its show delay is
  // invisible, and leaving it alone let it appear afterwards. It is also the only signal a
  // pointer resting on a link then moving to the blank space beside it ever produces.
  onPointerOut(evt) {
    const from = evt.target;
    const to = evt.relatedTarget;
    if (to && this.preview.contains(to)) return;
    // Moving between the pieces of one link — the text, then its padding, then the line it
    // sits on — is not leaving it.
    if (from && to && from.contains && from.contains(to)) return;
    // The resting place is gone, so the position kept for a later modifier press is stale:
    // onModifierChange re-asks it, and with the old coordinates a key press would bring the
    // preview back over a link the pointer had already left.
    this.pointer = null;
    this.leavePreview();
  }

  // The target under the pointer, with the note it belongs to and which surface answered —
  // or null. The surface matters: reading view previews on a plain hover, the editor waits
  // for the key, because that is what Obsidian itself does.
  hitAt(evt) {
    const anchor = this.linkFromEvent(evt);
    if (anchor) return Object.assign(anchor, { surface: 'reading' });
    const editor = this.editorHit(evt);
    if (editor) return Object.assign(editor, { surface: 'editor' });
    return null;
  }

  // Take every rendered code link out of Page preview's reach.
  //
  // Obsidian tags a rendered markdown link `internal-link` when it looks like a vault
  // path, and its Page preview plugin then treats it as one: it looks the path up in the
  // vault, does not find it (it is a file on disk, not a note), and shows a "not found"
  // popover beside ours. Swapping the class for `external-link` stops that at the source —
  // Page preview ignores external links — while leaving the element otherwise untouched,
  // so our own listener and Obsidian's normal open-on-click still work.
  markCodeLinks(root) {
    const anchors = root.querySelectorAll ? root.querySelectorAll('a') : [];
    for (const a of anchors) {
      const raw = a.getAttribute('href') || a.getAttribute('data-href') || '';
      if (!raw) continue;
      const target = parseTarget(raw);
      // Every http(s) URL is a target — a plain page is a `web` one, and previewing it is
      // the other half of the plugin's job. Only a `code` target is a link Obsidian would
      // wrongly search the vault for, so only that one is reclassified; a web link, a vault
      // note and an attachment are left exactly as Obsidian rendered them.
      if (!target || target.kind !== 'code') continue;

      const fixes = codeLinkFixes({
        href: a.getAttribute('href'),
        dataHref: a.getAttribute('data-href'),
      });
      if (!fixes) continue;

      for (const cls of fixes.remove) a.classList.remove(cls);
      for (const cls of fixes.add) a.classList.add(cls);
      // A tooltip is a second, worse answer to a question the panel already answers, and
      // `aria-label` is what Obsidian reads to create it.
      for (const attr of fixes.stripAttrs) a.removeAttribute(attr);
    }
  }

  // Reading view: the rendered link carries a real href, so the nearest <a> is the answer.
  linkFromEvent(evt) {
    for (let el = evt.target; el; el = el.parentElement) {
      if (el.tagName === 'A') {
        const raw = el.getAttribute('href') || el.getAttribute('data-href') || '';
        if (!raw) return null;
        const target = parseTarget(raw);
        if (!target) return null;
        return { target, sourcePath: this.sourcePathFor(el) };
      }
    }
    return null;
  }

  // The note a rendered element belongs to. `activeSourcePath` answers the pane with the
  // *focus*, and the pointer can rest on a link in any pane: with two notes open, a
  // relative link (`../src/main.c`) read against the focused note names a different file
  // than the same link in the pane under the pointer. The leaf containing the element is
  // the pane that rendered it, so its note is the one the path resolves from. An anchor
  // outside every leaf (a popover, a sidebar) falls back to the active note, which is the
  // old answer and still a better guess than nothing.
  sourcePathFor(el) {
    const leafEl = el && el.closest ? el.closest('.workspace-leaf') : null;
    const workspace = this.app && this.app.workspace;
    if (leafEl && workspace && typeof workspace.getLeavesOfType === 'function') {
      for (const leaf of workspace.getLeavesOfType('markdown')) {
        if (leaf && leaf.containerEl === leafEl && leaf.view && leaf.view.file) {
          return leaf.view.file.path;
        }
      }
    }
    return this.activeSourcePath();
  }

  // Live Preview: a code link is literal text inside CodeMirror, with no element to hang a
  // listener on. The pointer's position is turned into a document offset, and the line it
  // lands on is scanned — so the column decides which link, exactly as it would on screen.
  editorHit(evt) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor) return null;

    // Only this editor's own area counts; a pointer over the sidebar or a preview pane is
    // somebody else's business.
    if (view.containerEl && !view.containerEl.contains(evt.target)) return null;

    // Reading view has real anchors, handled above. Raw source mode shows the markdown
    // itself, and previewing there would fire while the reader is editing the link — so
    // only Live Preview qualifies. `editorLivePreviewField` is Obsidian's own answer to
    // "is this Live Preview?", which is more durable than inspecting the DOM.
    const cm = view.editor.cm;
    if (!cm) return null;
    try {
      if (!cm.state.field(editorLivePreviewField)) return null;
    } catch {
      return null;
    }

    // This handler runs on every mousemove over the editor, and the coordinate round-trip
    // below (`posAtCoords`) can force a layout — the expensive half of the plugin's hottest
    // path. The pointer can only be on a character while it is inside the editor's own
    // content element, and asking that is one cheap `contains`. The gutter, the scrollbar
    // and the pane's chrome are all outside `contentDOM`, and none of them can hit anyway.
    const content = cm.contentDOM;
    if (content && !content.contains(evt.target)) return null;

    let pos;
    try {
      pos = cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
    } catch {
      return null;
    }
    if (pos == null) return null;

    // `posAtCoords` snaps to the nearest character, so a pointer out in the blank space
    // right of a line still reports the line's last position — which, on a line ending in a
    // link, is the link. The character it snapped to has to be genuinely under the pointer
    // for the answer to mean anything.
    if (!pointerOverPos(cm, pos, evt)) return null;

    const line = cm.state.doc.lineAt(pos);
    const col = pos - line.from;
    const hits = findTargets(line.text);
    for (const hit of hits) {
      // The hit span, not the target span: pointing anywhere on `[the words](url)` should
      // preview it, and the words are where the pointer is.
      if (col >= hit.hitStart && col <= hit.hitEnd) {
        return { target: hit.target, sourcePath: this.activeSourcePath() };
      }
    }
    return null;
  }

  activeSourcePath() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view && view.file ? view.file.path : '';
  }
}

module.exports = HoverPreviewPlugin;
module.exports.default = HoverPreviewPlugin;
