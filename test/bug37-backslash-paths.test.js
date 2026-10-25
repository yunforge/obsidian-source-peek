'use strict';

// bug37: a Windows-spelled link (`..\src\main.c#L18`) parsed and highlighted fine —
// `extOf` and `looksLikeSourceFile` both treat `\` as a separator — but `resolveLocal`
// handed the string to Node as it stood, and on macOS/Linux Node treats `\` as an
// ordinary character. The link that named a language then failed to open at all, a
// file-not-found for a path the parsing half had already blessed. The reading half now
// normalises to `/`, so both halves agree on every platform.

const assert = require('assert/strict');
const path = require('path');
const { resolveLocal } = require('../src/code');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'bug37: a backslash-spelled path resolves like its forward-slash twin',
  run() {
    const vault = path.resolve('/vault');
    const notes = path.join(vault, 'notes');

    section('a relative path with backslashes resolves', () => {
      const viaBackslash = resolveLocal('..\\src\\main.c', notes, vault);
      const viaSlash = resolveLocal('../src/main.c', notes, vault);
      assert.notEqual(viaBackslash, null, 'the Windows spelling is a path, not a dead end');
      assert.equal(viaBackslash, viaSlash, 'and it names the same file as its twin');
      assert.equal(viaBackslash, path.join(vault, 'src', 'main.c'));
    });

    section('a vault-root path with backslashes resolves', () => {
      const viaBackslash = resolveLocal('\\src\\main.c', notes, vault);
      assert.equal(viaBackslash, path.join(vault, 'src', 'main.c'));
    });

    section('backslashes cannot climb out of the vault either', () => {
      // The confinement check runs on the resolved path, so the normalisation opens no
      // hole: a `..\..\` spelled either way is still refused.
      assert.equal(resolveLocal('..\\..\\secret.c', notes, vault), null);
      assert.equal(resolveLocal('../../secret.c', notes, vault), null);
    });

    section('mixed separators resolve (a half-converted paste)', () => {
      assert.equal(
        resolveLocal('..\\lib\\util\\text.c', notes, vault),
        path.join(vault, 'lib', 'util', 'text.c'),
      );
    });
  },
};
