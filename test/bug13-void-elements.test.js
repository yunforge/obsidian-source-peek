'use strict';

// bug13: a void element with no self-closing slash pushed an id that never came back off.
//
// A heading with no id of its own inherits the nearest enclosing container's id, so that a
// fragment copied out of the address bar (`#method.new`) resolves against the `<section>` a
// rustdoc page wraps the heading in. Containers are tracked as a stack of open ids, pushed on
// the opening tag and popped on the closing one — which is why a void element had no business
// being on it. `<hr id="sep">` has no `</hr>` to come, so the id stayed on the stack for the
// rest of the document and *every* heading after it inherited `sep`, whether or not it was
// inside anything. `<hr id="sep"/>` escaped only because the self-closing slash made the loop
// skip the tag entirely, and `<br>` escaped because it is handled earlier, for its newline.
//
// The fix is that a void element is never a container, with or without the slash. What it is
// *not* is a change to how those elements are read otherwise: `<br>` still breaks the line,
// `<pre>` still keeps its tags as text, and a real container (`div`, `section`, `table`)
// still hands its id down to the headings inside it.

const assert = require('assert/strict');
const { extract } = require('../src/web');

// The void elements of the HTML spec: no closing tag, and no content.
const VOID_TAGS = [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
];

// Obsolete elements the HTML parser still treats as void. They are dead on the live web, but
// old CMS exports and archived pages write them, and the fix would be silently weakened if
// someone trimmed this half of the set back to the spec fourteen.
const OBSOLETE_VOID_TAGS = ['basefont', 'bgsound', 'frame', 'isindex', 'keygen'];

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

const headings = (html, heading) => extract(html, heading).blocks
  .filter((b) => b.type === 'h')
  .map((b) => ({ text: b.text, id: b.id }));

// The heading's id, or the absence of one, in one comparable value: `undefined` and `null`
// both mean "no id", and a test should not care which spelling of nothing the block used.
const idOf = (block) => (block && block.id ? block.id : null);

const onlyHeading = (html, heading) => {
  const h = headings(html, heading);
  assert.equal(h.length, 1, 'expected exactly one heading, got ' + JSON.stringify(h));
  return h[0];
};

module.exports = {
  name: 'bug13: a void element is not a container, so its id is never inherited',
  run() {
    section('the case from the report', () => {
      // `<hr id="wrong">` is a separator with a stray id, not a section. The heading that
      // follows it is not inside it, so it has no id of its own to show.
      assert.equal(idOf(onlyHeading('<hr id="wrong"><h2>Install</h2>')), null);
      assert.deepEqual(headings('<hr id="wrong"><h2>Install</h2>'), [{ text: 'Install', id: undefined }]);
    });

    section('every void element, without the slash', () => {
      // The report's census: all of them but `<br>` were polluted, and `<br>` only because
      // it is handled before the container tracking is reached.
      for (const tag of VOID_TAGS) {
        const h = onlyHeading('<' + tag + ' id="wrong"><h2>X</h2>');
        assert.equal(h.text, 'X', '<' + tag + '> should still let the heading through');
        assert.equal(idOf(h), null, '<' + tag + ' id="wrong"> was inherited by the heading after it');
      }
    });

    section('every void element, with the slash', () => {
      // The spelling that always worked has to keep working, and by the same route: the tag
      // is skipped as a container rather than by falling out of the loop early.
      for (const tag of VOID_TAGS) {
        for (const slash of ['/>', ' />']) {
          const h = onlyHeading('<' + tag + ' id="wrong"' + slash + '><h2>X</h2>');
          assert.equal(idOf(h), null, '<' + tag + ' id="wrong"' + slash + '> was inherited');
        }
      }
    });

    section('the id does not leak to a second heading either', () => {
      // The bug was not that one heading got the id: it was that the stack entry never came
      // off, so every heading to the end of the page got it.
      for (const tag of VOID_TAGS) {
        const h = headings('<' + tag + ' id="wrong"><h2>X</h2><h3>Y</h3>');
        assert.deepEqual(h.map(idOf), [null, null], '<' + tag + '> leaked its id down the page');
        assert.deepEqual(h.map((b) => b.text), ['X', 'Y']);
      }
    });

    section('void elements in a row', () => {
      // The last one pushed used to win, so `<img id="b">` overwrote `<hr id="a">` and the
      // heading showed the id of the image just above it.
      assert.equal(idOf(onlyHeading('<hr id="a"><img id="b"><h2>X</h2>')), null);
      assert.equal(idOf(onlyHeading('<img id="b"><hr id="a"><h2>X</h2>')), null);
      assert.equal(idOf(onlyHeading('<hr id="a"/><img id="b"/><h2>X</h2>')), null);
      // With other content between them, so the separator is not the only thing walked past.
      assert.equal(idOf(onlyHeading('<hr id="a"><p>text</p><img id="b"><p>more</p><h2>X</h2>')), null);
    });

    section('the shapes a real page has', () => {
      // From the report: a `<main>` whose prose is punctuated by a rule and a logo, where both
      // headings were given the id of the element just above them.
      assert.deepEqual(headings('<main><hr id="sep"><h2>Parameters</h2><img id="logo"><h3>Returns</h3></main>'),
        [{ text: 'Parameters', id: undefined }, { text: 'Returns', id: undefined }]);
      // Python's docs spelling, with an unclosed `<hr>` and an unclosed `<link>`.
      assert.deepEqual(
        headings('<div role="main"><h1>Title</h1><hr><h2>Usage</h2><link rel="x" id="lnk"><h3>Options</h3></div>')
          .map(idOf),
        [null, null, null],
      );
      // An `<input>` with several attributes, which the tag regex has to read past.
      assert.equal(idOf(onlyHeading('<input id="q" type="text" placeholder="a > b"><h2>A</h2>')), null);
    });

    section('the obsolete void elements are covered too', () => {
      // Nothing on the live web writes these, which is exactly why they would rot unnoticed:
      // trimming them from the set leaves every other assertion in this file green.
      for (const tag of OBSOLETE_VOID_TAGS) {
        const h = onlyHeading('<' + tag + ' id="wrong"><h2>X</h2>');
        assert.equal(idOf(h), null, '<' + tag + ' id="wrong"> was inherited by the heading after it');
      }
    });

    section('a container is never mistaken for a void element', () => {
      // The other direction of the same guard. Every assertion above asks for one id too few;
      // none of them would notice an element wrongly added to the void set, which costs a
      // heading its anchor. These elements all wrap content and must keep handing their id
      // down.
      //
      // `<article>` and `<main>` are left out on purpose: they already failed to hand their id
      // down before this fix, which is a separate defect and not something to pin here.
      //
      // `<p>` is left out for the opposite reason: a `<p>` cannot contain a heading — the
      // parser closes it first — so `<p id="outer"><h2>X</h2>` is not a shape a real page
      // has. It handed `outer` down only because nothing ever closed the `p`, which is a
      // defect to fix, not behaviour to pin.
      const WRAPPERS = ['div', 'section', 'nav', 'aside', 'header', 'footer',
        'form', 'figure', 'blockquote', 'table', 'ul', 'ol', 'span', 'details', 'fieldset'];
      for (const tag of WRAPPERS) {
        const h = onlyHeading('<' + tag + ' id="outer"><h2>X</h2></' + tag + '>');
        assert.equal(idOf(h), 'outer', '<' + tag + '> stopped handing its id down');
      }
    });

    section('a real container still hands its id down', () => {
      // The other half of the fix: tracking containers at all is the point of `openIds`, and
      // making void elements stop being containers must not make every element stop being one.
      assert.deepEqual(headings('<div id="sect"><h2>Install</h2></div><h2>Other</h2>'),
        [{ text: 'Install', id: 'sect' }, { text: 'Other', id: undefined }],
        'a heading inside a div takes its id, and one after the div does not');
      assert.deepEqual(headings('<section id="sec"><h2>A</h2></section><h2>B</h2>'),
        [{ text: 'A', id: 'sec' }, { text: 'B', id: undefined }]);
      assert.deepEqual(headings('<table id="t"><h2>D</h2></table>'), [{ text: 'D', id: 't' }]);
      // Nested containers: the nearest one is the one that counts.
      assert.deepEqual(headings('<div id="d1"><div id="d2"><h3>C</h3></div></div>'), [{ text: 'C', id: 'd2' }]);
      // A container that closes before the heading is not enclosing it.
      assert.deepEqual(headings('<div id="d1"></div><div id="d2"><h3>C</h3></div>'), [{ text: 'C', id: 'd2' }]);
    });

    section('a void element after a container does not disturb it', () => {
      // The two lines cross: a real container that is still open, then a void element inside
      // it. The heading is inside the `<div>`, so it gets the div's id — not the `<hr>`'s, and
      // not nothing either, since the div's entry is still on the stack.
      assert.deepEqual(headings('<div id="d"><hr id="wrong"><h2>A</h2></div><h2>B</h2>'),
        [{ text: 'A', id: 'd' }, { text: 'B', id: undefined }]);
      // And a void element in front of a container: the div is the nearest, either way.
      assert.deepEqual(headings('<hr id="wrong"><div id="d"><h2>X</h2></div><h2>Y</h2>'),
        [{ text: 'X', id: 'd' }, { text: 'Y', id: undefined }]);
    });

    section('a heading keeps its own id', () => {
      // The container id is only a fallback, so the fix must not have made a heading lose an
      // id it wrote itself.
      assert.deepEqual(headings('<div id="d"><h2 id="own">X</h2></div>'), [{ text: 'X', id: 'own' }]);
      assert.deepEqual(headings('<hr id="wrong"><h2 id="own">X</h2>'), [{ text: 'X', id: 'own' }]);
      assert.deepEqual(headings('<div id="d"><h2 id="own">X</h2></div><h2>Y</h2>'),
        [{ text: 'X', id: 'own' }, { text: 'Y', id: undefined }]);
    });

    section('a fragment addressed to a void id resolves nothing', () => {
      // What the pollution cost in practice: `#sep` — an id on a separator — answered with
      // the Parameters section, because the Parameters heading had been given that id.
      const miss = extract('<hr id="sep"><h2>Parameters</h2><p>body</p><h2>Other</h2>', 'sep');
      assert.equal(miss.headingMiss, true, '#sep should not resolve to a heading nothing anchors');
      assert.deepEqual(miss.blocks.map((b) => b.text), []);
      // A fragment addressed to a heading's text still resolves, and a container id still
      // addresses the heading inside it.
      const byText = extract('<hr id="sep"><h2>Parameters</h2><p>body</p><h2>Other</h2>', 'parameters');
      assert.equal(byText.headingMiss, false);
      assert.deepEqual(byText.blocks.map((b) => b.text), ['Parameters', 'body']);
      const byContainer = extract('<section id="install"><h2>Whatever</h2><p>x</p></section><h2>Other</h2>', 'install');
      assert.equal(byContainer.headingMiss, false);
      assert.deepEqual(byContainer.blocks.map((b) => b.text), ['Whatever', 'x']);
    });

    section('what a void element does is otherwise unchanged', () => {
      // The newline `<br>` contributes, which is the one behaviour the id-tracking branch must
      // never be allowed to swallow.
      assert.deepEqual(extract('<p>x<br>y</p>').blocks, [{ type: 'p', text: 'x\ny' }]);
      assert.deepEqual(extract('<p>x<br id="b">y</p>').blocks, [{ type: 'p', text: 'x\ny' }]);
      assert.deepEqual(extract('<p>x<br/>y</p>').blocks, [{ type: 'p', text: 'x\ny' }]);
      // A `<pre>` reads its content verbatim, including anything that looks like a void tag.
      assert.deepEqual(extract('<pre><code class="language-python">def f(x):\n    return 1</code></pre>').blocks,
        [{ type: 'pre', text: 'def f(x):\n    return 1', lang: 'python' }]);
      // A closing tag for an element that has no content is stray markup, and stays harmless.
      assert.equal(idOf(onlyHeading('<hr id="wrong"></hr><h2>Install</h2>')), null);
      assert.deepEqual(headings('<div id="d"><h2>A</h2></div></hr><h2>B</h2>'),
        [{ text: 'A', id: 'd' }, { text: 'B', id: undefined }],
        'a stray </hr> neither pushes nor pops');
    });
  },
};
