'use strict';

// bug09: a path that mixes '/' and '\' must take its basename from whichever separator
// comes LAST in the original string. The old extOf() sliced the already-truncated string
// with an index measured against the original, so it chopped extra characters off the
// basename and lost the extension (`a\b/c.txt` -> '', not 'txt').

const assert = require('assert/strict');
const { extOf, langFor } = require('../src/code');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'bug09: mixed separators resolve the extension',
  run() {
    section('a slash after a backslash still finds the basename', () => {
      assert.equal(extOf('a\\b/c.txt'), 'txt', 'backslash then slash');
      assert.equal(extOf('a\\b/c.py'), 'py');
      assert.equal(extOf('dir\\sub/leaf.rs'), 'rs');
    });

    section('a backslash after a slash still finds the basename', () => {
      assert.equal(extOf('a/b\\c.txt'), 'txt', 'slash then backslash');
      assert.equal(extOf('a/b\\c.js'), 'js');
      assert.equal(extOf('dir/sub\\leaf.md'), 'md');
    });

    section('the last dot wins, and a dot in a directory is not it', () => {
      assert.equal(extOf('a\\b/c.d.e/x.gz'), 'gz', 'dots in the directory do not count');
      assert.equal(extOf('a/b\\c.d.e/x.gz'), 'gz', 'the same, with the separators swapped');
      assert.equal(extOf('a\\b/c.d'), 'd', 'the basename is only `c.d`');
    });

    section('langFor picks the grammar from a mixed path', () => {
      assert.equal(langFor('a\\b/c.py'), 'python', 'backslash then slash');
      assert.equal(langFor('a/b\\c.js'), 'javascript', 'slash then backslash');
      assert.equal(langFor('C:\\x\\y.rs'), 'rust', 'pure windows path is unchanged');
    });

    section('paths that are not mixed do not regress', () => {
      assert.equal(extOf('C:\\x\\y.rs'), 'rs', 'pure windows path');
      assert.equal(extOf('a/b/c.tar.gz'), 'gz', 'pure posix path');
      assert.equal(extOf('a\\b/c.d/e'), '', 'a dot in a directory is not the extension');
      assert.equal(extOf('a\\b/c'), '', 'no extension in a mixed path');
      assert.equal(extOf('a.b/c'), '', 'a dot in a directory, single separator');
      assert.equal(extOf('.gitignore'), '', 'a dotfile has no extension');
      assert.equal(extOf(''), '');
      assert.equal(extOf(null), '');
    });
  },
};
