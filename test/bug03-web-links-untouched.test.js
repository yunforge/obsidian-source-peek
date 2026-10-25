'use strict';

// markCodeLinks must only touch links that point at *code*.
//
// `parseTarget` answers for every http(s) URL — a plain page is a `{kind:'web'}` target, and
// that is deliberate: hovering a web link previews the page. But `markCodeLinks` used to ask
// only "is this a target?", so every web link was reclassified as external and had its
// `aria-label` — the thing Obsidian builds the "Follow link" tooltip from — taken away.
//
// README.md:146 promises the opposite: "普通的 vault 笔记链接和附件链接完全不受影响". Web links
// are rendered links too, and a preview being *possible* for them is not a reason to rewrite
// them. The five rows below are the report's evidence table, asserted one by one.

const assert = require('assert/strict');
const Module = require('module');
const { parseTarget } = require('../src/parse');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

// --- an anchor small enough to see every change ---------------------------

// Only the members `markCodeLinks` actually reaches for: `getAttribute`, `classList`, and
// `removeAttribute`. The class set and the attribute map are kept observable so a test can
// say what the link looked like *after* the pass, not merely what was called.
class FakeAnchor {
  constructor(href, attrs, classes) {
    this.attrs = Object.assign({ href }, attrs);
    const set = new Set(classes);
    this.classes = set;
    this.classList = {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c),
    };
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  removeAttribute(name) {
    delete this.attrs[name];
  }
  // A stable, readable rendering of the element's public state for assertion messages.
  state() {
    return {
      classes: [...this.classes].sort().join(' '),
      ariaLabel: this.getAttribute('aria-label'),
    };
  }
}

const TOOLTIP = {
  'aria-label': 'Follow link',
  'data-tooltip-position': 'top',
  'data-tooltip-delay': '800',
};

module.exports = {
  name: 'bug03: markCodeLinks leaves web links, vault notes and attachments alone',
  run() {
    const realDocument = global.document;
    const realWindow = global.window;
    global.document = { body: {}, addEventListener() {} };
    global.window = { addEventListener() {} };

    const realLog = console.error;
    console.error = () => {};
    // src/main.js is a plugin module and refuses to load without Obsidian's own module; the
    // class itself is plain CommonJS, so the module is stubbed out for the load only.
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

    try {
      // The premise the fix rests on: a web link *is* a target, and `kind` is what tells it
      // apart from code. If this ever stops being true the test below loses its meaning.
      assert.equal(parseTarget('https://example.com/page').kind, 'web');

      const plugin = Object.create(HoverPreviewPlugin.prototype);

      section('an ordinary web link is not rewritten', () => {
        const web = new FakeAnchor('https://example.com/page', TOOLTIP, ['external-link']);
        const before = web.state();

        plugin.markCodeLinks({ querySelectorAll: () => [web] });

        assert.deepEqual(web.state(), before, 'a web link keeps its classes and its aria-label');
        assert.equal(web.getAttribute('aria-label'), 'Follow link', 'aria-label kept: true');
        assert.equal(web.getAttribute('data-tooltip-position'), 'top');
        assert.equal(web.getAttribute('data-tooltip-delay'), '800');
      });

      section('a web link narrowed to a heading is not rewritten', () => {
        const heading = new FakeAnchor('https://example.com/page#install', TOOLTIP, ['external-link']);
        const before = heading.state();

        plugin.markCodeLinks({ querySelectorAll: () => [heading] });

        assert.deepEqual(heading.state(), before, 'a heading fragment does not make it code');
        assert.equal(heading.getAttribute('aria-label'), 'Follow link', 'aria-label kept: true');
      });

      section('a vault note link is not rewritten', () => {
        const note = new FakeAnchor('Notes/Some note.md', TOOLTIP, ['internal-link']);
        const before = note.state();

        plugin.markCodeLinks({ querySelectorAll: () => [note] });

        assert.deepEqual(note.state(), before, 'Page preview owns vault notes, not this plugin');
        assert.ok(note.classList.contains('internal-link'), 'internal-link is still there');
        assert.equal(note.classList.contains('external-link'), false, 'no external-link was added');
        assert.equal(note.getAttribute('aria-label'), 'Follow link', 'aria-label kept: true');
      });

      section('an attachment link is not rewritten', () => {
        const file = new FakeAnchor('assets/diagram.png', TOOLTIP, ['internal-link']);
        const before = file.state();

        plugin.markCodeLinks({ querySelectorAll: () => [file] });

        assert.deepEqual(file.state(), before, 'attachments are vault files, not code');
        assert.ok(file.classList.contains('internal-link'), 'internal-link is still there');
        assert.equal(file.getAttribute('aria-label'), 'Follow link', 'aria-label kept: true');
      });

      section('a local code link still gets the fixes', () => {
        const code = new FakeAnchor('../src/main.c#L18', TOOLTIP, ['internal-link', 'is-unresolved']);

        plugin.markCodeLinks({ querySelectorAll: () => [code] });

        assert.ok(code.classList.contains('external-link'), 'code is reclassified as external');
        assert.equal(code.classList.contains('internal-link'), false, 'internal-link was removed');
        assert.equal(code.classList.contains('is-unresolved'), false, 'is-unresolved was removed');
        assert.equal(code.getAttribute('aria-label'), null, 'aria-label kept: false');
        assert.equal(code.getAttribute('data-tooltip-position'), null, 'no tooltip position left');
      });

      section('a remote code link is fixed too, in the same pass', () => {
        // The blob URL is a `{kind:'code'}` target even though it is http(s): that is the
        // pair the fix must separate — same scheme, different kind.
        const remote = new FakeAnchor(
          'https://github.com/o/r/blob/main/src/main.c#L18-L23',
          TOOLTIP,
          ['internal-link'],
        );
        const web = new FakeAnchor('https://example.com/page', TOOLTIP, ['external-link']);

        plugin.markCodeLinks({ querySelectorAll: () => [remote, web] });

        assert.ok(remote.classList.contains('external-link'), 'the remote code link is fixed');
        assert.equal(remote.getAttribute('aria-label'), null, 'and its tooltip attrs are stripped');
        assert.equal(web.getAttribute('aria-label'), 'Follow link', 'the web link beside it is not');
      });
    } finally {
      global.document = realDocument;
      global.window = realWindow;
    }
  },
};
