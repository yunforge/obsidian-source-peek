'use strict';

// remote: the pure half. The obsidian module is required lazily inside fetchText, so
// requiring this module must not need the app -- that is what lets it be tested here.

const assert = require('assert/strict');
const { rawUrlFor, fetchText, MAX_REMOTE_CHARS } = require('../src/remote');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'remote: rawUrlFor mapping, lazy obsidian require',
  async run() {
    section('rawUrlFor: github blob -> raw.githubusercontent', () => {
      assert.deepEqual(rawUrlFor('https://github.com/o/r/blob/main/src/main.c'), {
        host: 'github',
        path: 'src/main.c',
        rawUrl: 'https://raw.githubusercontent.com/o/r/main/src/main.c',
      });
      assert.deepEqual(rawUrlFor('http://github.com/o/r/blob/v1.2/src/a/b.c'), {
        host: 'github',
        path: 'src/a/b.c',
        rawUrl: 'https://raw.githubusercontent.com/o/r/v1.2/src/a/b.c',
      });
      assert.deepEqual(rawUrlFor('https://www.github.com/o/r/blob/main/x.c'), {
        host: 'github',
        path: 'x.c',
        rawUrl: 'https://raw.githubusercontent.com/o/r/main/x.c',
      });
    });

    section('rawUrlFor: gitlab blob -> /-/raw', () => {
      assert.deepEqual(rawUrlFor('https://gitlab.com/g/p/-/blob/main/src/main.c'), {
        host: 'gitlab',
        path: 'src/main.c',
        rawUrl: 'https://gitlab.com/g/p/-/raw/main/src/main.c',
      });
      assert.deepEqual(rawUrlFor('https://gitlab.com/a/b/c/-/blob/main/x.c'), {
        host: 'gitlab',
        path: 'x.c',
        rawUrl: 'https://gitlab.com/a/b/c/-/raw/main/x.c',
      });
    });

    section('rawUrlFor: nothing to map', () => {
      assert.equal(rawUrlFor('https://github.com/o/r/tree/main/src'), null, 'tree is not blob');
      assert.equal(rawUrlFor('https://github.com/o/r'), null, 'repo root is not blob');
      assert.equal(rawUrlFor('https://bitbucket.org/o/r/src/x.c'), null, 'unsupported host');
      assert.equal(rawUrlFor('https://raw.githubusercontent.com/o/r/main/x.c'), null, 'already raw');
      assert.equal(rawUrlFor(''), null);
      assert.equal(rawUrlFor(null), null);
      assert.equal(rawUrlFor('not a url'), null);
    });

    section('the module loaded with no obsidian present', () => {
      assert.equal(typeof rawUrlFor, 'function');
      assert.equal(typeof fetchText, 'function');
      assert.equal(MAX_REMOTE_CHARS, 2 * 1024 * 1024);
    });

    // No obsidian module exists anywhere in this process, so this call exercises the
    // lazy require's failure path: it must report a failure, never throw.
    const res = await fetchText('https://example.com/x');
    assert.equal(res.ok, false);
    assert.equal(res.text, '');
    assert.match(res.error, /obsidian|requestUrl/i);
  },
};
