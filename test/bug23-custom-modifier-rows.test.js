'use strict';

// The custom-modifier settings rows: one labelled row per key, so each switch says which
// key it belongs to.
//
// The bug: all three keys' labels were appended to the *same* Setting's description while
// its three toggles sat side by side in one control, so nothing tied a name to a switch.
// There is no DOM here to look at, so this test supplies the two Obsidian classes the
// settings pane touches (`PluginSettingTab`, `Setting`) plus a container that counts what
// was built into it, and reads the rows back.

const assert = require('assert/strict');
const Module = require('module');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// --- a container that remembers what was put in it -------------------------

class El {
  constructor() { this.children = []; }
  empty() { this.children = []; }
  createDiv() {
    const el = new El();
    this.children.push(el);
    return el;
  }
  createEl() {
    const el = new El();
    this.children.push(el);
    return el;
  }
}

// `Setting` records a row as data rather than pixels: its name, its description, and the
// toggles hanging off it. Only the methods `settings-tab.js` calls exist, so a row built a
// different way fails loudly instead of being quietly tolerated.
class Setting {
  constructor(containerEl) {
    this.row = { type: 'setting', name: null, desc: null, toggles: [], descSpans: [] };
    containerEl.children.push(this.row);
    // Obsidian gives every Setting a `descEl` a row can write into. The bug wrote all three
    // key names there, so the stub keeps them: a row that labels its switches this way is
    // visible to the test instead of failing on a missing method.
    this.descEl = { createSpan: (o) => { this.row.descSpans.push(o && o.text); } };
  }
  setName(name) { this.row.name = name; return this; }
  setDesc(desc) { this.row.desc = desc; return this; }
  // The modifier dropdown: `settings-tab.js` only builds options and wires a change
  // handler here, so the stub accepts both and records nothing.
  addDropdown(cb) {
    cb({ addOption() { return this; }, setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addToggle(cb) {
    const toggle = {
      value: null,
      change: null,
      setValue(v) { this.value = v; return this; },
      onChange(fn) { this.change = fn; return this; },
    };
    this.row.toggles.push(toggle);
    cb(toggle);
    return this;
  }
}

// Load `src/settings-tab.js` against the stubs above, with English labels pinned (the real
// `i18n` reads Obsidian's language from `window.localStorage`, which a test process lacks).
function loadTab() {
  const realWindow = global.window;
  global.window = { localStorage: { getItem: () => 'en' } };
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === 'obsidian') {
      return {
        // `settings-tab.js` reads `this.containerEl` and `this.plugin`; `display()` is
        // called by hand below, as Obsidian would.
        PluginSettingTab: class {
          constructor(app, plugin) {
            this.plugin = plugin;
            this.containerEl = new El();
          }
        },
        Setting,
      };
    }
    return origLoad.apply(this, arguments);
  };
  try {
    for (const file of ['src/i18n.js', 'src/settings-tab.js']) {
      delete require.cache[require.resolve(path.join(ROOT, file))];
    }
    return require(path.join(ROOT, 'src', 'settings-tab.js'));
  } finally {
    Module._load = origLoad;
    global.window = realWindow;
  }
}

// Build the pane for a plugin whose settings are `settings`, and hand back the rows.
function buildPane(settings) {
  const { HoverPreviewSettingTab } = loadTab();
  const plugin = { settings, saveSettings: async () => {} };
  const tab = new HoverPreviewSettingTab({}, plugin);
  tab.display();
  const rows = tab.containerEl.children.filter((c) => c.type === 'setting');
  return { rows, plugin };
}

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'bug23: each custom modifier key gets its own labelled row',
  async run() {
    section('custom mode: one named row per key, in key order', () => {
      const { rows } = buildPane({ enabled: true, hoverModifier: 'custom', hoverModifiers: ['ctrl', 'alt'] });

      // The rows that carry a name, in the order they are drawn. The key rows must come
      // after the dropdown that turned them on, one row per key.
      const named = rows.filter((r) => r.name).map((r) => r.name);
      assert.deepEqual(
        named.slice(0, 5),
        ['Preview on hover', 'Show preview while holding', 'Ctrl', 'Shift', 'Alt'],
        'each custom key has a row named after it, in ctrl/shift/alt order',
      );
      assert.equal(named.length, 5, 'exactly five named rows: the two settings and the three keys');

      // The explanation row still sits between the dropdown and the keys, and carries no
      // switch of its own — the bug's row carried all three, under one description.
      const explain = rows.filter((r) => r.desc === 'Which keys, together, a hover waits for.');
      assert.equal(explain.length, 1, 'the custom-mode explanation is one row');
      assert.equal(explain[0].name, null, 'the explanation row has no name of its own');
      assert.equal(explain[0].toggles.length, 0, 'and no switch');

      // The symptom in one line: the key names used to be spans inside a row's description,
      // where nothing tied them to the switches beside them.
      const described = rows.filter((r) => r.descSpans.length);
      assert.deepEqual(
        described.map((r) => r.descSpans),
        [],
        'no row labels its switches from inside a description',
      );

      // One switch per named row: that is the name-to-switch pairing the bug broke.
      for (const name of ['Ctrl', 'Shift', 'Alt']) {
        const row = rows.filter((r) => r.name === name);
        assert.equal(row.length, 1, 'exactly one row is named ' + name);
        assert.equal(row[0].toggles.length, 1, 'the ' + name + ' row has exactly one toggle');
      }

      // No row may hold more than one of these toggles.
      const crowded = rows.filter((r) => r.toggles.length > 1);
      assert.equal(crowded.length, 0, 'no row holds several custom-key toggles at once');
    });

    section('custom mode: each toggle starts from the matching key', () => {
      const { rows } = buildPane({ enabled: true, hoverModifier: 'custom', hoverModifiers: ['ctrl', 'alt'] });

      const value = (name) => rows.filter((r) => r.name === name)[0].toggles[0].value;
      assert.equal(value('Ctrl'), true, 'ctrl is in the modifier list');
      assert.equal(value('Shift'), false, 'shift is not');
      assert.equal(value('Alt'), true, 'alt is');
    });

    section('custom mode: a toggle writes its own key, not a neighbour', () => {
      const { rows, plugin } = buildPane({ enabled: true, hoverModifier: 'custom', hoverModifiers: ['ctrl'] });

      const toggle = (name) => rows.filter((r) => r.name === name)[0].toggles[0];

      toggle('Shift').change(true);
      assert.deepEqual(plugin.settings.hoverModifiers, ['ctrl', 'shift'], 'switching Shift on adds shift');

      toggle('Ctrl').change(false);
      assert.deepEqual(plugin.settings.hoverModifiers, ['shift'], 'switching Ctrl off removes ctrl');
    });

    section('other modes draw no custom-key rows', () => {
      for (const mode of ['ctrl', 'shift', 'none']) {
        const { rows } = buildPane({ enabled: true, hoverModifier: mode, hoverModifiers: ['ctrl'] });
        const names = rows.map((r) => r.name);
        for (const key of ['Ctrl', 'Shift', 'Alt']) {
          assert.equal(names.includes(key), false, 'mode ' + mode + ' has no ' + key + ' row');
        }
      }
    });
  },
};
