'use strict';

// bug20: `this.pointer` was only ever written, never cleared. `onPointerOut` let the preview
// go but left the recorded coordinates standing, so a modifier key pressed after the pointer
// had left re-asked the last link's position and brought the preview back over nothing:
//
//   rest on a link  -> schedule(100, 200)
//   pointer leaves  -> leave() (preview cancelled)
//   press Ctrl      -> evaluate({x:100, y:200, target: <the old link>}) -> schedule again
//
// The pointer's resting place is now cleared when the pointer leaves, and the modifier
// completion — rest on a link, then reach for the key, with no mousemove in between — still
// works, because there the pointer never left. The real plugin class is driven end to end
// through `onload()`; `obsidian` is stubbed at Module._load, and the preview is a recorder
// (the popover shell has its own tests).

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

// --- obsidian stub, installed just long enough to load src/main -------------------------
// This file drives the real onload(), so the stub Plugin carries the registration methods
// the real base class provides. An earlier test file (bug03) already loaded src/main under
// a narrower stub; its cached copy is dropped so this load sees this file's stub.
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
class PluginSettingTab { constructor() {} }
class Setting {}

const obsidianStub = {
  Plugin: FakePlugin,
  MarkdownView: class {},
  Notice: class {},
  editorLivePreviewField: { key: 'stub' },
  PluginSettingTab,
  Setting,
};

const origLoad = Module._load;
delete require.cache[require.resolve('../src/main')];
Module._load = function (request) {
  if (request === 'obsidian') return obsidianStub;
  return origLoad.apply(this, arguments);
};
const HoverPreviewPlugin = require('../src/main');
Module._load = origLoad;

// A link element as reading view renders it, with the plugin's own preview swapped for a
// recorder that logs every shell call in order.
function linkEl(href) {
  return {
    tagName: 'A',
    parentElement: null,
    getAttribute: (k) => (k === 'href' ? href : null),
  };
}
function recorder() {
  const calls = [];
  return {
    calls,
    schedule(_target, _sourcePath, x, y) { calls.push(['schedule', x, y]); },
    leave() { calls.push(['leave']); },
    cancelHide() { calls.push(['cancelHide']); },
    hide() { calls.push(['hide']); },
    isVisible: () => false,
    contains: () => false,
    destroy() {},
  };
}

// A plugin wired exactly as onload wires it, with the recorder in place of the shell.
async function freshPlugin() {
  const p = new HoverPreviewPlugin({ workspace: { getActiveViewOfType: () => null } });
  await p.onload();
  p.preview = recorder();
  p.settings.enabled = true;
  p.settings.hoverModifier = 'ctrl';
  return p;
}

const keydown = (key, held) => ({
  key,
  ctrlKey: held === 'ctrl',
  shiftKey: held === 'shift',
  altKey: held === 'alt',
  metaKey: false,
});

module.exports = {
  name: 'bug20: a modifier press after the pointer left does not resurrect the preview',
  async run() {
    section('the report scenario: leave, then press Ctrl', async () => {
      const p = await freshPlugin();
      const link = linkEl('https://example.com/page');
      p.handlers.mousemove({ clientX: 100, clientY: 200, target: link, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false });
      assert.deepEqual(p.preview.calls, [['cancelHide'], ['schedule', 100, 200]], 'resting on the link schedules the preview');

      // The pointer is gone — out of the document entirely (no relatedTarget).
      p.preview.calls.length = 0;
      p.handlers.mouseout({ target: link, relatedTarget: null });
      assert.deepEqual(p.preview.calls, [['leave']], 'leaving lets the preview go');

      // The key arrives with no mousemove after the leave.
      p.preview.calls.length = 0;
      p.handlers.keydown(keydown('Control', 'ctrl'));
      assert.deepEqual(p.preview.calls, [],
        'a modifier press after the pointer left must not schedule from the stale coordinates');
    });

    section('rest on the link, then reach for the key — still completes the hover', async () => {
      const p = await freshPlugin();
      const link = linkEl('https://example.com/page');
      p.handlers.mousemove({ clientX: 100, clientY: 200, target: link, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false });
      p.preview.calls.length = 0;
      p.handlers.keydown(keydown('Control', 'ctrl'));
      // The pointer never left: the recorded position is still true, and the key press
      // re-asks it. (Reading view previews on plain hover, so this re-ask is a no-op
      // re-schedule of the same target — the point is that it is not suppressed.)
      assert.deepEqual(p.preview.calls, [['cancelHide'], ['schedule', 100, 200]],
        'the completion path must keep working when the pointer is still on the link');
    });

    section('editor surface: rest, press the key, then leave and press again', async () => {
      const p = await freshPlugin();
      // A Live Preview editor whose line holds one code link, character box under the
      // pointer, per pointer.js.
      const cm = {
        posAtCoords: () => 5,
        coordsAtPos: () => ({ left: 90, right: 110, top: 190, bottom: 210 }),
        state: {
          field: () => true,
          doc: { lineAt: () => ({ from: 0, text: '[the parser](../src/main.c#L18)' }) },
        },
      };
      const view = {
        containerEl: { contains: () => true },
        editor: { cm },
        file: { path: 'notes/note.md' },
      };
      p.app = { workspace: { getActiveViewOfType: () => view } };
      const spanEl = { tagName: 'SPAN', parentElement: null, closest: () => null, getAttribute: () => null };

      // Plain hover over an editor link waits for the key: nothing schedules.
      p.handlers.mousemove({ clientX: 100, clientY: 200, target: spanEl, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false });
      assert.deepEqual(p.preview.calls, [['leave']], 'no key, no preview');

      // The key completes the hover.
      p.handlers.keydown(keydown('Control', 'ctrl'));
      assert.ok(p.preview.calls.some((c) => c[0] === 'schedule'), 'key press completes the hover');

      // The pointer leaves; a second key press must not bring it back.
      p.handlers.mouseout({ target: spanEl, relatedTarget: null });
      p.preview.calls.length = 0;
      p.handlers.keydown(keydown('Control', 'ctrl'));
      assert.deepEqual(p.preview.calls, [], 'stale editor coordinates must not re-schedule');
    });

    section('a modifier press with the pointer never yet seen is a no-op', async () => {
      const p = await freshPlugin();
      p.handlers.keydown(keydown('Control', 'ctrl'));
      assert.deepEqual(p.preview.calls, []);
    });
  },
};
