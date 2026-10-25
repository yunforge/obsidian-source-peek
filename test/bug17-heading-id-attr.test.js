'use strict';

// bug17: `\bid\s*=` matched the `id` inside `data-id`, and inside another attribute's value.
//
// `headingId` searched the raw attribute region with `\bid\s*=\s*["']([^"']+)["']`. The `-`
// before `id` is a word boundary, so `data-id="content"` matched; a quote inside an earlier
// attribute's value could too (`aria-label="id='fake'"` contains `id='fake'`). An id read
// from either is an anchor the page never declared, and a heading that carries a false anchor
// answers to a fragment that was never meant for it — or hands that fragment the wrong
// section. The same read sat under container inheritance, so a `<div data-id="content">`
// passed the phantom id down to every heading inside it.
//
// Ids are now read attribute by attribute (the same reader the body-container search uses),
// which compares whole attribute names and skips values, so only a real `id=` is read.

const assert = require('assert/strict');
const { extract } = require('../src/web');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

// The id each heading block ended up with, in document order.
const headingIds = (html) =>
  extract(html).blocks.filter((b) => b.type === 'h').map((b) => b.id || '');

module.exports = {
  name: 'bug17: an id is read from the id attribute, not from data-id or another value',
  run() {
    section('a heading whose data-id is not an anchor', () => {
      assert.deepEqual(headingIds('<h2 data-id="wrong">Title</h2><p>body</p>'), ['']);
      // No id of its own and no container: the heading also does not answer to a fragment
      // that names the data-id spelling.
      const page = '<h2 data-id="install">Install</h2><p>step one</p><h2>Usage</h2><p>step two</p>';
      const r = extract(page, 'install');
      // "install" still resolves — by the heading's text — but through the text, not the
      // data-id; a fragment naming only the data-id must miss.
      assert.equal(r.headingMiss, false, 'text matching must keep working');
      const r2 = extract('<h2 data-id="method.new">pub fn new()</h2><p>body</p>', 'method.new');
      assert.equal(r2.headingMiss, true, 'a data-id must not answer to a fragment');
    });

    section('an id= spelled inside another attribute\'s value is not an anchor', () => {
      assert.deepEqual(headingIds('<h2 aria-label="id=\'fake\'">Title</h2><p>body</p>'), ['']);
      // The real id, further along the same tag, is the one that counts.
      assert.deepEqual(headingIds('<h2 aria-label="id=\'fake\'" id="real">Title</h2>'), ['real']);
    });

    section('a real id is still read', () => {
      assert.deepEqual(headingIds('<h2 id="content">Title</h2>'), ['content']);
      assert.deepEqual(headingIds("<h2 id='single'>Title</h2>"), ['single']);
      assert.deepEqual(headingIds('<h2 id = "spaced" >Title</h2>'), ['spaced']);
      assert.deepEqual(headingIds('<h2 ID="upper">Title</h2>'), ['upper']);
      assert.deepEqual(headingIds('<h2 class="x" id="after">Title</h2>'), ['after']);
      assert.deepEqual(headingIds('<h2 id="a>b">Title</h2>'), ['a>b']);
    });

    section('a heading with no id inherits a real container id — but not a data-id', () => {
      // rustdoc puts the anchor on the wrapping section; that inheritance is the point.
      assert.deepEqual(headingIds('<section id="method.new"><h4>New</h4></section>'), ['method.new']);
      // The phantom spelling must not travel the same path.
      assert.deepEqual(headingIds('<section data-id="method.new"><h4>New</h4></section>'), ['']);
      assert.deepEqual(headingIds('<div data-id="content"><h2>Nested</h2></div>'), ['']);
    });
  },
};
