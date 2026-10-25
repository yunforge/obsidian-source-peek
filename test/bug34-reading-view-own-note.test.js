'use strict';

// bug34: a reading-view link's note was read from the *active* pane. `linkFromEvent`
// accepted any anchor in the document but answered `activeSourcePath()` — the file of
// whichever pane has the focus. With two notes open, resting the pointer on a relative
// link (`../src/main.c`) in the unfocused pane resolved the path against the focused
// note's folder: a different file, or "no path to read", for a link that was spelled
// correctly where it lived.
//
// The note is now read from the leaf that rendered the anchor. Driven through src/main.js
// with a fake workspace, in the style of popover.test.js's plugin cases.

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

// An anchor as `linkFromEvent` sees it: a real href, and — when the test says which leaf
// it sits in — a `closest` that answers for it.
function anchor(href, leafEl) {
  return {
    tagName: 'A',
    parentElement: null,
    getAttribute(name) { return name === 'href' ? href : null; },
    closest: (sel) => (sel === '.workspace-leaf' && leafEl ? leafEl : null),
  };
}

module.exports = {
  name: 'bug34: a reading-view link resolves from the note it sits in',
  async run() {
    const realDocument = global.document;
    const realWindow = global.window;
    global.document = { body: null, addEventListener() {} };
    global.window = { innerWidth: 1200, innerHeight: 800, addEventListener() {} };

    const realLog = console.error;
    console.error = () => {};
    const origLoad = Module._load;
    Module._load = function (request) {
      if (request === 'obsidian') {
        return {
          Plugin: class {}, PluginSettingTab: class {}, Setting: class {},
          MarkdownView: class {}, Notice: class {}, editorLivePreviewField: {},
        };
      }
      return origLoad.apply(this, arguments);
    };

    try {
      const HoverPreviewPlugin = require('../src/main');

      // Two panes: A has the focus, B is merely under the pointer.
      const leafA = { name: 'leafA' };
      const leafB = { name: 'leafB' };
      const viewA = { file: { path: 'notes/a.md' } };
      const viewB = { file: { path: 'projects/deep/b.md' } };

      const makePlugin = () => {
        const plugin = Object.create(HoverPreviewPlugin.prototype);
        plugin.settings = { enabled: true, hoverModifier: 'none' };
        plugin.held = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
        plugin.pointer = null;
        plugin.app = {
          vault: { adapter: { getBasePath: () => '' } },
          workspace: {
            getActiveViewOfType: () => viewA,
            getLeavesOfType: () => [
              { containerEl: leafA, view: viewA },
              { containerEl: leafB, view: viewB },
            ],
          },
        };
        // The preview only needs to record what it was asked to schedule.
        plugin.preview = {
          contains: () => false,
          cancelHide() {},
          leave() {},
          hide() {},
          schedule(target, sourcePath) { plugin.captured = { target, sourcePath }; },
        };
        return plugin;
      };

      section('a link in the unfocused pane resolves against that pane', () => {
        const plugin = makePlugin();
        plugin.onPointerMove({ target: anchor('../src/main.c#L18', leafB), clientX: 5, clientY: 5 });
        assert.ok(plugin.captured, 'the hover asked for a preview');
        assert.equal(plugin.captured.sourcePath, 'projects/deep/b.md',
          'the note is the one whose leaf the anchor sits in, not the focused one');
        assert.equal(plugin.captured.target.kind, 'code');
      });

      section('a link in the focused pane is unchanged', () => {
        const plugin = makePlugin();
        plugin.onPointerMove({ target: anchor('../src/main.c#L18', leafA), clientX: 5, clientY: 5 });
        assert.equal(plugin.captured.sourcePath, 'notes/a.md');
      });

      section('an anchor outside every leaf falls back to the active note', () => {
        // A popover or a sidebar link has no `.workspace-leaf` above it; the active note is
        // the old answer and remains the guess.
        const plugin = makePlugin();
        plugin.onPointerMove({ target: anchor('../src/main.c#L18', null), clientX: 5, clientY: 5 });
        assert.equal(plugin.captured.sourcePath, 'notes/a.md');
      });

      section('a leaf whose view holds no file falls back too', () => {
        const plugin = makePlugin();
        plugin.app.workspace.getLeavesOfType = () => [
          { containerEl: leafA, view: viewA },
          { containerEl: leafB, view: { file: null } },
        ];
        plugin.onPointerMove({ target: anchor('../src/main.c#L18', leafB), clientX: 5, clientY: 5 });
        assert.equal(plugin.captured.sourcePath, 'notes/a.md');
      });

      section('an anchor with no closest at all (the old fakes) still previews', () => {
        const plugin = makePlugin();
        const plain = {
          tagName: 'A',
          parentElement: null,
          getAttribute(name) { return name === 'href' ? '../src/main.c#L18' : null; },
        };
        plugin.onPointerMove({ target: plain, clientX: 5, clientY: 5 });
        assert.ok(plugin.captured);
        assert.equal(plugin.captured.sourcePath, 'notes/a.md');
      });
    } finally {
      Module._load = origLoad;
      console.error = realLog;
      global.document = realDocument;
      global.window = realWindow;
    }
  },
};
