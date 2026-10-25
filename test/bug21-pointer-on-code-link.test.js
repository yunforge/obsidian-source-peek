'use strict';

// bug21: `pointerOnCodeLink` answered "is a code link under the pointer" from the column
// `posAtCoords` snapped to. CodeMirror snaps to the *nearest* character — right answers for
// placing a caret, wrong for deciding what the pointer is over: blank space right of a line
// snaps to the line's last character, which on a line ending in a link is the link. This
// function gates the mouseover capture handler, whose `stopPropagation()` runs before every
// other plugin's delegate has seen the event — so a hover in the margin next to a code link
// was silently eaten. editorHit has always demanded the snapped character really be under
// the pointer (`pointerOverPos`); the capture path now needs the same proof.
//
// Driven through the real onload()-wired mouseover handler, exactly as the capture phase
// delivers it.

const assert = require('assert/strict');
const Module = require('module');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

// --- obsidian stub (see bug20's note about the shared module cache) ----------------------
class FakePlugin {
  constructor(app) {
    this.app = app;
    this.handlers = {};
  }
  registerDomEvent(_target, type, fn) { this.handlers[type] = fn; }
  registerMarkdownPostProcessor() {}
  addSettingTab() {}
  addCommand() {}
  async loadData() { return {}; }
  async saveData() {}
}

const obsidianStub = {
  Plugin: FakePlugin,
  MarkdownView: class {},
  Notice: class {},
  editorLivePreviewField: { key: 'stub' },
  PluginSettingTab: class { constructor() {} },
  Setting: class {},
};

const origLoad = Module._load;
delete require.cache[require.resolve('../src/main')];
Module._load = function (request) {
  if (request === 'obsidian') return obsidianStub;
  return origLoad.apply(this, arguments);
};
const HoverPreviewPlugin = require('../src/main');
Module._load = origLoad;

// An editor whose single line is scanned for targets. `posAtCoords` snaps to the line's
// last character no matter where on the x axis the pointer is — that is the snapping the
// fix is about. `coordsAtPos` answers where that character really is on screen.
function editorAt(lineText, box) {
  const cm = {
    posAtCoords: () => lineText.length - 1,
    coordsAtPos: () => box,
    state: { doc: { lineAt: () => ({ from: 0, text: lineText }) } },
  };
  const view = { editor: { cm }, file: { path: 'notes/note.md' } };
  return { workspace: { getActiveViewOfType: () => view } };
}

// Deliver a mouseover through the real capture handler. `box` is where the snapped
// character sits on screen; x/y are where the pointer is.
function mouseover(app, lineText, x, y, box) {
  const p = new HoverPreviewPlugin(editorAt(lineText, box));
  p.handlers.mouseover = null; // not yet: onload wires it
  return p.onload().then(() => {
    const span = {
      removed: [],
      removeAttribute(k) { this.removed.push(k); },
    };
    const events = [];
    const evt = {
      target: { closest: () => span },
      clientX: x,
      clientY: y,
      stopPropagation() { events.push('stopped'); },
    };
    p.handlers.mouseover(evt);
    return { span, events };
  });
}

// Both lines END with their link: that is the shape the defect lives in — blank space to
// the right of a line-ending link snaps to the link's own last character.
const CODE_LINE = 'see [the parser](../src/main.c#L18)';
const VAULT_LINE = '[[a real note]]';
const OVER = { left: 90, right: 110, top: 190, bottom: 210 }; // the link's last character

module.exports = {
  name: 'bug21: blank space beside a code link is not a hit, so other plugins keep their events',
  async run() {
    await section('a pointer over the link itself is kept: ours to preview', async () => {
      const { span, events } = await mouseover(null, CODE_LINE, 100, 200, OVER);
      assert.deepEqual(events, ['stopped'], 'a code link under the pointer is ours to keep');
      assert.ok(span.removed.indexOf('aria-label') >= 0, 'the tooltip source is cleared');
    });

    await section('blank space right of the link is not a hit', async () => {
      // Same line, same snapped character; the pointer is out in the margin, far from the
      // character it snapped to. Before the fix this still stopped propagation.
      const { span, events } = await mouseover(null, CODE_LINE, 300, 200, OVER);
      assert.deepEqual(events, [], 'the margin hover must reach other plugins untouched');
      assert.deepEqual(span.removed, [], 'and the span is not ours to edit');
    });

    await section('blank space above or below the line is not a hit either', async () => {
      // posAtCoords has no vertical slack by design (pointer.js): y outside the line box is
      // a different line's territory.
      const { events } = await mouseover(null, CODE_LINE, 100, 260, OVER);
      assert.deepEqual(events, [], 'a hover below the line must not be captured');
    });

    await section('a vault link is never captured', async () => {
      const { span, events } = await mouseover(null, VAULT_LINE, 100, 200, OVER);
      assert.deepEqual(events, [], 'a line with no code target is not ours');
      assert.deepEqual(span.removed, []);
    });

    await section('an editor that cannot answer coordinates keeps out of the way', async () => {
      // No cm: the capture handler must not stop anything it cannot judge.
      const p = new HoverPreviewPlugin({ workspace: { getActiveViewOfType: () => null } });
      await p.onload();
      const events = [];
      p.handlers.mouseover({
        target: { closest: () => ({ removeAttribute() {} }) },
        clientX: 100, clientY: 200,
        stopPropagation() { events.push('stopped'); },
      });
      assert.deepEqual(events, [], 'without an editor, nothing is captured');
    });

    await section('editorHit needs the same proof: margin hover does not preview even with the key', async () => {
      // The same snapping, the same blank space, on the evaluate path. With the modifier
      // held a link-shaped answer WOULD schedule, so the margin must be a miss, not a hit
      // that happens to wait for a key.
      const cm = {
        posAtCoords: () => CODE_LINE.length - 1,
        coordsAtPos: () => OVER,
        state: {
          field: () => true,
          doc: { lineAt: () => ({ from: 0, text: CODE_LINE }) },
        },
      };
      const view = { containerEl: { contains: () => true }, editor: { cm }, file: { path: 'n.md' } };
      const p = new HoverPreviewPlugin({ workspace: { getActiveViewOfType: () => view } });
      await p.onload();
      p.preview = {
        calls: [],
        schedule() { this.calls.push('schedule'); },
        leave() { this.calls.push('leave'); },
        cancelHide() {},
        hide() {},
        isVisible: () => false,
        contains: () => false,
        destroy() {},
      };
      p.settings.hoverModifier = 'ctrl';
      const spanEl = { tagName: 'SPAN', parentElement: null, getAttribute: () => null };
      p.handlers.mousemove({ clientX: 300, clientY: 200, target: spanEl, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false });
      assert.deepEqual(p.preview.calls, ['leave'],
        'the margin beside a line-ending link is not a link, key held or not');
    });
  },
};
