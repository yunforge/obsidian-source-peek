'use strict';

// bug32: a custom modifier combination with every key switched off answered
// `requiredModifiers('custom', [])` with `[]` — a plain hover. That is `none`'s meaning
// exactly, reached silently: the reader picked "Custom…", saw three switches, turned them
// all off, and got the one behaviour they had deliberately not chosen, with nothing on
// screen saying so.
//
// Chosen contract (option A of the task): an empty custom list is a misconfiguration, not a
// decision. It answers Ctrl — the default every other mode falls back to — and the settings
// pane says so beside the switches. `none`'s own semantics are untouched.

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

const { requiredModifiers, shouldPreview, needsKey } = require('../src/modifier');
const { LOCALES } = require('../src/i18n');

// The settings pane, driven far enough to see which notes it writes. `Setting` is Obsidian's
// chainable builder; the stub records only what the assertion needs.
function renderNotes(settings) {
  const origLoad = Module._load;
  delete require.cache[require.resolve('../src/settings-tab')];
  Module._load = function (request) {
    if (request === 'obsidian') {
      return {
        PluginSettingTab: class { constructor() { this.containerEl = null; } },
        Setting: class {
          constructor(el) { this.el = el; }
          setName() { return this; }
          setDesc() { return this; }
          addDropdown() { return this; }
          addToggle() { return this; }
        },
      };
    }
    return origLoad.apply(this, arguments);
  };
  try {
    const { HoverPreviewSettingTab } = require('../src/settings-tab');
    const notes = [];
    const containerEl = {
      empty() {},
      createDiv(o) {
        notes.push(o);
        // The help block below calls createEl on the div it was handed.
        return { createEl() { return {}; }, createDiv() { return {}; } };
      },
      createEl() { return {}; },
    };
    const tab = new HoverPreviewSettingTab({}, { settings, saveSettings: async () => {} });
    tab.containerEl = containerEl;
    tab.display();
    return notes.filter((n) => n.cls === 'cp-settings-note').map((n) => n.text);
  } finally {
    Module._load = origLoad;
  }
}

const ev = (held) => ({
  ctrlKey: held.ctrl || false,
  shiftKey: held.shift || false,
  altKey: held.alt || false,
  metaKey: false,
});

module.exports = {
  name: 'bug32: a custom combination with every key off falls back to the default, and says so',
  run() {
    section('an empty custom list requires the default key', () => {
      assert.deepEqual(requiredModifiers('custom', []), ['ctrl']);
      assert.deepEqual(requiredModifiers('custom'), ['ctrl']);
      assert.deepEqual(requiredModifiers('custom', ['hyper', 'mega']), ['ctrl'],
        'a list with nothing the plugin knows is as empty as an all-off one');
      assert.equal(shouldPreview(ev({}), 'custom', [], false), false);
      assert.equal(shouldPreview(ev({ ctrl: true }), 'custom', [], false), true);
      // Mac semantics ride along: the 'ctrl' requirement reads Cmd there, and holding
      // plain Ctrl satisfies it too (that is heldModifiers' long-standing reading).
      assert.equal(shouldPreview(ev({ ctrl: true }), 'custom', [], true), true);
      assert.equal(shouldPreview({ ctrlKey: false, metaKey: true }, 'custom', [], true), true,
        'Cmd is the key the Mac default names');
      assert.equal(shouldPreview(ev({}), 'custom', [], true), false);
    });

    section('a list with a real key is exactly the keys listed', () => {
      assert.deepEqual(requiredModifiers('custom', ['shift']), ['shift']);
      assert.deepEqual(requiredModifiers('custom', ['ctrl', 'alt']), ['ctrl', 'alt']);
    });

    section('none keeps its own semantics — no key, ever', () => {
      assert.deepEqual(requiredModifiers('none'), []);
      assert.equal(shouldPreview(ev({}), 'none', null, false), true);
      assert.equal(shouldPreview(ev({ shift: true }), 'none', null, false), true);
      assert.equal(needsKey('none'), false);
      // And the two modes are no longer the same thing.
      assert.notDeepEqual(requiredModifiers('custom', []), requiredModifiers('none'));
    });

    section('the settings pane says what an empty custom list does', () => {
      const hintEn = LOCALES.en['settings.modifier.customEmptyHint'];
      const hintZh = LOCALES.zh['settings.modifier.customEmptyHint'];
      assert.ok(hintEn && hintEn.length > 0, 'the English hint exists');
      assert.ok(hintZh && hintZh.length > 0, 'the Chinese hint exists');

      const empty = renderNotes({ enabled: true, hoverModifier: 'custom', hoverModifiers: [] });
      assert.ok(empty.some((n) => n === hintEn), 'the note is shown beside the switches');

      const set = renderNotes({ enabled: true, hoverModifier: 'custom', hoverModifiers: ['ctrl'] });
      assert.ok(!set.some((n) => n === hintEn), 'a chosen combination needs no note');

      const none = renderNotes({ enabled: true, hoverModifier: 'none', hoverModifiers: [] });
      assert.ok(!none.some((n) => n === hintEn), 'the none hint is the only note there');
    });
  },
};
