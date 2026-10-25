'use strict';

// dead02: PRISM_MAX_LINES was defined twice — code.js exported one copy, render.js kept its
// own — so tuning one silently forked the plain-text fallback threshold between callers.
// The threshold now has exactly one definition (code.js) and render.js reads it from there;
// these assertions pin that shape, because a fork (say, a renamed import shadowed by a local
// copy) would otherwise be invisible to every behaviour test: the value is a performance
// knob nothing else depends on.

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

const src = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');

module.exports = {
  name: 'dead02: the Prism line threshold is defined once',
  run() {
    section('code.js defines it; render.js imports it', () => {
      assert.match(src('code.js'), /const PRISM_MAX_LINES = \d+;/, 'the definition lives in code.js');
      const render = src('render.js');
      assert.match(render, /require\('\.\/code'\)/, 'render.js reads it from code.js');
      assert.doesNotMatch(render, /const PRISM_MAX_LINES\s*=/,
        'render.js must not shadow the import with its own copy — that is the fork this task removed');
      // preview.js takes the same source (its own import is unchanged by this task, pinned
      // so a future local copy cannot creep in either).
      assert.doesNotMatch(src('preview.js'), /const PRISM_MAX_LINES\s*=/);
    });
  },
};
