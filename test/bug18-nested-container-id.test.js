'use strict';

// bug18: closing a same-name container that carries no id used to pop the outer container's
// id along with it, because the id stack only held the elements that carried an id — an
// id-less <div> was invisible to it, so its `</div>` matched the outer id-bearing entry and
// released an anchor that was still open.
//
// The id stack now holds every element still open, in document order, and a closing tag pops
// to the last entry bearing its own tag name: pairing is by element, not by id. These tests
// pin that pairing. (No production change was needed for this task — the element-identity
// stack arrived with the bug13/14 id rework — so the suite is the thing being proven here:
// each pinned shape below has a mutation in the bug18 matrix that breaks it and must fail.)
//
// Note on the report's literal repro, `<div id="content"><div><h2>…</h2></div></div>`: that
// heading can never carry `content`, and must not — `id="content"` is one of the spellings
// articleBody treats as the page's own content container, so the walk only ever sees the
// id-less inner div. The defect class is pinned below with ids that are not body
// container ids.

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

const headingIds = (html) =>
  extract(html).blocks.filter((b) => b.type === 'h').map((b) => b.id || '');

module.exports = {
  name: 'bug18: an id-less nested container does not pop the outer container\'s id',
  run() {
    section('nested same-name containers, only the outermost carries an id', () => {
      assert.deepEqual(headingIds('<div id="outer"><div><h2>Install</h2></div></div>'), ['outer']);
      assert.deepEqual(headingIds('<div id="a"><div><div><h2>T</h2></div></div></div>'), ['a']);
      // rustdoc's shape: the anchor sits on the section, the prose sits two divs down.
      assert.deepEqual(
        headingIds('<section id="method.new"><div><div><h4>pub fn new()</h4></div></div></section>'),
        ['method.new']);
    });

    section('the inner closer leaves the outer id on the stack', () => {
      // The heading comes after the inner container closed: if `</div>` released `outer`,
      // the heading would inherit nothing.
      assert.deepEqual(
        headingIds('<div id="outer"><div><p>filler</p></div><h2>Later</h2></div>'), ['outer']);
    });

    section('an inner container with its own id does not leak past its close', () => {
      // `inner` belongs to its own element only; the heading after the close takes `outer`,
      // not `inner`, and in a flat document a closed container's id reaches nothing.
      assert.deepEqual(
        headingIds('<div id="outer"><p>before</p><div id="inner"><p>in</p></div><h2>After</h2></div>'),
        ['outer']);
      assert.deepEqual(headingIds('<div id="spent"><p>in</p></div><h2>After</h2>'), ['']);
    });

    section('sibling containers: each heading takes its own container', () => {
      assert.deepEqual(
        headingIds('<div id="first"><h2>One</h2></div><div><h2>Two</h2></div>'), ['first', '']);
    });

    section('lists: implicit and explicit closes pair with their own element', () => {
      // A heading after a nested list closes is still inside the outer <li>.
      assert.deepEqual(
        headingIds('<ul><li id="a">x<ul><li>y</li></ul><h2>H</h2></li></ul>'), ['a']);
      // The implicit <li> close (next <li> starts) releases only the spent element:
      // a heading after the </ul> inherits neither id.
      assert.deepEqual(headingIds('<ul><li id="a">first<li>second</ul><h2>After</h2>'), ['']);
    });

    section('the report repro is container consumption, not id loss', () => {
      // id="content" names the page's content container, so articleBody walks only the
      // id-less inner div. Pin the shape to catch the two ways it could regress: the id
      // detection stopping (then the outer div survives with its id and the heading gains
      // `content`), or the id stack regaining the pop bug (then a non-body spelling below
      // loses its id — covered by the sections above).
      assert.deepEqual(
        headingIds('<div id="content"><div><h2>Install</h2></div></div>'), ['']);
      assert.deepEqual(extract('<div id="content"><div><h2>Install</h2></div></div>').blocks,
        [{ type: 'h', level: 2, text: 'Install' }]);
    });
  },
};
