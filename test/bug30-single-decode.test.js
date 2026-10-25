'use strict';

// bug30: the fragment was percent-decoded twice — parse.js decoded it when the link was
// parsed, and web.js decoded it again when the page was searched. For ordinary fragments
// (`#Getting%20Started`) the second pass is invisible (there is nothing left to decode),
// but a heading that legitimately contains `%20` or `%25` folded twice: a link written
// `#Topic%2520X` arrived at the page search as `Topic X` instead of `Topic%20X`, and
// matched — or missed — the wrong thing.
//
// The decoding now lives in exactly one place: parse.js. web.js receives the fragment
// already decoded and searches for it as it stands.

const assert = require('assert/strict');
const { parseTarget } = require('../src/parse');
const { extract } = require('../src/web');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

const page = '<h2>Topic%20X</h2><p>the odd heading</p><h2>A B</h2><p>the spacey heading</p><h2>安装指南</h2><p>cjk</p>';

module.exports = {
  name: 'bug30: a fragment is decoded once, by the parser',
  run() {
    section('parse.js decodes exactly once', () => {
      assert.equal(parseTarget('https://x.com/p#Topic%2520X').heading, 'Topic%20X',
        '%2520 decodes to the literal text %20, not to a space');
      assert.equal(parseTarget('https://x.com/p#A%20B').heading, 'A B');
      assert.equal(parseTarget('https://x.com/p#Topic%25X').heading, 'Topic%X');
      // A malformed escape rides through as written.
      assert.equal(parseTarget('https://x.com/p#100%').heading, '100%');
      // CJK and mixed-case fragments pass through untouched.
      assert.equal(parseTarget('https://x.com/p#安装指南').heading, '安装指南');
      assert.equal(parseTarget('https://x.com/p#Getting%20Started').heading, 'Getting Started');
    });

    section('web.js searches for the fragment as it stands', () => {
      // The heading on the page literally reads "Topic%20X"; the link said %2520.
      const r = extract(page, 'Topic%20X');
      assert.equal(r.headingMiss, false, 'the once-decoded fragment resolves');
      assert.deepEqual(r.blocks.map((b) => b.text), ['Topic%20X', 'the odd heading']);
      // The twice-decoded spelling must NOT match: nothing decodes it a second time.
      const r2 = extract(page, 'Topic X');
      assert.equal(r2.headingMiss, true, 'a doubly-decoded fragment is not what the link said');
      const r3 = extract(page, 'Topic%2520X');
      assert.equal(r3.headingMiss, true, 'and neither is the raw encoded form');
    });

    section('everyday encoded fragments still resolve end to end', () => {
      // parse decodes once; the page's heading is the decoded text.
      const r = extract(page, parseTarget('https://x.com/p#A%20B').heading);
      assert.equal(r.headingMiss, false);
      assert.deepEqual(r.blocks.map((b) => b.text), ['A B', 'the spacey heading']);
      const cjk = extract(page, parseTarget('https://x.com/p#安装指南').heading);
      assert.equal(cjk.headingMiss, false);
      assert.deepEqual(cjk.blocks.map((b) => b.text), ['安装指南', 'cjk']);
      // Case-insensitivity and slugs are untouched.
      const slug = extract('<h2>Getting Started</h2><p>x</p>', 'getting-started');
      assert.equal(slug.headingMiss, false);
    });
  },
};
