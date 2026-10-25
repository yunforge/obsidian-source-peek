'use strict';

// code: extension -> Prism grammar, and the line window out of a file.

const assert = require('assert/strict');
const { extOf, langFor, sliceLines, resolveLocal, MAX_LINE, MAX_WINDOW_LINES } = require('../src/code');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'code: extOf, langFor, sliceLines',
  run() {
    section('extOf: extension without the dot, lower-cased', () => {
      assert.equal(extOf('../src/main.c'), 'c');
      assert.equal(extOf('../src/main.C'), 'c', 'case does not matter');
      assert.equal(extOf('.gitignore'), '', 'a dotfile has no extension');
      assert.equal(extOf('Makefile'), '');
      assert.equal(extOf('a/b/c.tar.gz'), 'gz', 'the last dot wins');
      assert.equal(extOf('C:\\dir\\main.js'), 'js', 'windows separator');
      assert.equal(extOf('x.'), '');
      assert.equal(extOf('a.b/c'), '');
      assert.equal(extOf(''), '');
      assert.equal(extOf(null), '');
    });

    section('extOf: mixed separators, either order', () => {
      assert.equal(extOf('a\\b/c.txt'), 'txt', 'backslash then slash');
      assert.equal(extOf('a/b\\c.txt'), 'txt', 'slash then backslash');
      assert.equal(extOf('C:\\x\\y.rs'), 'rs', 'pure windows path still works');
      assert.equal(extOf('/x\\y\\z.tar.gz'), 'gz', 'last dot wins in a mixed path');
      assert.equal(extOf('a\\b/c.d/e'), '', 'a dot in a directory is not the extension');
      assert.equal(extOf('a\\b/c'), '', 'no extension in a mixed path');
      assert.equal(extOf('\\a\\b\\'), '');
    });

    section('langFor: mixed separators pick the right grammar', () => {
      assert.equal(langFor('a\\b/c.txt'), 'clike', 'txt is unknown, so the generic grammar');
      assert.equal(langFor('a/b\\c.py'), 'python', 'slash then backslash');
      assert.equal(langFor('a\\b/c.js'), 'javascript', 'backslash then slash');
      assert.equal(langFor('C:\\x\\y.rs'), 'rust');
    });

    section('langFor: Prism grammar for an extension', () => {
      assert.equal(langFor('../src/main.c'), 'c');
      assert.equal(langFor('x.h'), 'c');
      assert.equal(langFor('x.cpp'), 'cpp');
      assert.equal(langFor('x.tsx'), 'tsx');
      assert.equal(langFor('main.js'), 'javascript');
      assert.equal(langFor('x.yaml'), 'yaml');
      assert.equal(langFor('x.htm'), 'markup');
      assert.equal(langFor('x.zzz'), 'clike', 'unknown extension still highlights');
      assert.equal(langFor('.gitignore'), 'clike');
      assert.equal(langFor('Makefile'), 'clike');
    });

    section('sliceLines: a window is 1-based and inclusive', () => {
      assert.deepEqual(sliceLines('a\nb\nc\nd', 1, 3),
        { startLine: 1, lines: ['a', 'b', 'c'], truncated: false });
      assert.deepEqual(sliceLines('a\nb\nc\nd', 2, 2),
        { startLine: 2, lines: ['b'], truncated: false });
      assert.deepEqual(sliceLines('a\nb\nc\nd', 4, 4),
        { startLine: 4, lines: ['d'], truncated: false });
      assert.deepEqual(sliceLines('a\nb', undefined, undefined),
        { startLine: 1, lines: ['a'], truncated: false }, 'no range means the first line');
      assert.deepEqual(sliceLines('a\nb', 0, 1),
        { startLine: 1, lines: ['a'], truncated: false }, 'line numbers start at 1');
    });

    section('sliceLines: running off either end', () => {
      assert.equal(sliceLines('a\nb\nc\nd', 5, 6), null, 'from past the last line');
      assert.equal(sliceLines('a\nb\nc\nd', 99, 100), null);
      assert.deepEqual(sliceLines('a\nb\nc\nd', 3, 99),
        { startLine: 3, lines: ['c', 'd'], truncated: false }, 'to is clamped, not null');
    });

    section('sliceLines: the cap truncates', () => {
      assert.deepEqual(sliceLines('a\nb\nc\nd', 1, 4, 2),
        { startLine: 1, lines: ['a', 'b'], truncated: true });
      assert.deepEqual(sliceLines('a\nb\nc', 1, 3, 3),
        { startLine: 1, lines: ['a', 'b', 'c'], truncated: false }, 'an exact fit is not truncated');
      assert.deepEqual(sliceLines('a\nb\nc\nd', 2, 4, 1),
        { startLine: 2, lines: ['b'], truncated: true }, 'the cap starts from the window');
    });

    section('sliceLines: CRLF and lone CR are line breaks', () => {
      assert.deepEqual(sliceLines('a\r\nb\r\nc', 1, 3),
        { startLine: 1, lines: ['a', 'b', 'c'], truncated: false });
      assert.deepEqual(sliceLines('a\r\nb\r\nc', 2, 2),
        { startLine: 2, lines: ['b'], truncated: false }, 'no stray carriage return');
      assert.deepEqual(sliceLines('a\rb\rc', 1, 3),
        { startLine: 1, lines: ['a', 'b', 'c'], truncated: false }, 'lone CR');
      assert.deepEqual(sliceLines('a\r\nb\r\n', 1, 5),
        { startLine: 1, lines: ['a', 'b'], truncated: false }, 'trailing CRLF is not a line');
      assert.deepEqual(sliceLines('a\nb\n', 1, 5),
        { startLine: 1, lines: ['a', 'b'], truncated: false }, 'trailing LF is not a line');
    });

    section('sliceLines: an enormous line is capped and marked', () => {
      const out = sliceLines('x'.repeat(MAX_LINE + 100), 1, 1);
      assert.equal(out.lines.length, 1);
      assert.equal(out.lines[0].length, MAX_LINE + 1, 'MAX_LINE characters plus the ellipsis');
      assert.ok(out.lines[0].endsWith('\u2026'));
      assert.equal(sliceLines('short line', 1, 1).lines[0], 'short line', 'short lines are untouched');
      assert.equal(MAX_WINDOW_LINES, 4000);
    });

    section('resolveLocal: a relative path resolves from the note', () => {
      const vault = '/vault';
      const noteDir = '/vault/paths/01_module_path';
      assert.equal(resolveLocal('./src/main.rs', noteDir, vault),
        '/vault/paths/01_module_path/src/main.rs');
      assert.equal(resolveLocal('src/main.rs', noteDir, vault),
        '/vault/paths/01_module_path/src/main.rs', 'a bare path is relative too');
      assert.equal(resolveLocal('../02_use_paths/src/a.rs', noteDir, vault),
        '/vault/paths/02_use_paths/src/a.rs', '`..` walks up from the note');
    });

    section('resolveLocal: a leading slash means the vault root', () => {
      const vault = '/vault';
      const noteDir = '/vault/paths/01_module_path';
      assert.equal(resolveLocal('/src/main.rs', noteDir, vault), '/vault/src/main.rs');
      assert.equal(resolveLocal('/paths/x.rs', noteDir, vault), '/vault/paths/x.rs');
      // Not the filesystem root: a note written for a vault means "from the top of my vault".
      assert.notEqual(resolveLocal('/src/main.rs', noteDir, vault), '/src/main.rs');
    });

    section('resolveLocal: nothing may climb above the vault', () => {
      const vault = '/vault';
      const noteDir = '/vault/paths/01_module_path';
      assert.equal(resolveLocal('../../../etc/passwd', noteDir, vault), null);
      assert.equal(resolveLocal('../../../x.rs', noteDir, vault), null);
      assert.equal(resolveLocal('/../../etc/passwd', noteDir, vault), null);
      // Reaching the vault itself is not a file either.
      assert.equal(resolveLocal('../../../..', noteDir, vault), null);
    });

    section('resolveLocal: the edge of the vault is still inside', () => {
      const vault = '/vault';
      const noteDir = '/vault/paths/01_module_path';
      // Two levels up lands on the vault root, which is allowed as a base — the path itself
      // has to name something below it.
      assert.equal(resolveLocal('../../top.rs', noteDir, vault), '/vault/top.rs');
    });

    section('resolveLocal: an empty or missing path is not a path', () => {
      assert.equal(resolveLocal('', '/vault/notes', '/vault'), null);
      assert.equal(resolveLocal('   ', '/vault/notes', '/vault'), null);
      assert.equal(resolveLocal(null, '/vault/notes', '/vault'), null);
      assert.equal(resolveLocal(undefined, '/vault/notes', '/vault'), null);
    });

    section('sliceLines: empty input still has a first line', () => {
      assert.deepEqual(sliceLines('', 1, 1), { startLine: 1, lines: [''], truncated: false });
      assert.deepEqual(sliceLines(null, 1, 1), { startLine: 1, lines: [''], truncated: false });
    });
  },
};
