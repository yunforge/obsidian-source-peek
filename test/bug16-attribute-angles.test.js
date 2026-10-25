'use strict';

// bug16: an angle bracket inside a quoted attribute value cut the article body in half.
//
// `articleBody` used to find the content container with four regexes built on `[^>]*` —
// `<main\b[^>]*>`, `<article\b[^>]*>`, and the `role="main"` / `id="content"` spellings. A
// regex has no way to know about quotes, so `[^>]*` stopped at the first `>` even when it sat
// inside an attribute value: `<main data-x="a>b">` was read as a tag ending after `a`, the
// body started in the middle of the attribute, and the leftover `b">` was walked as prose.
//
// The matching-closer search had the same defect for the same reason — its
// `<tag\b[^>]*>` alternative also counted a tag with a quoted `>` as ending early, so nested
// containers threw the depth count off by one and the body was sliced at the wrong `</tag>`.
//
// Both halves now scan with the quote-aware `scanTag`, so a `>` inside a value is part of the
// value. What must not change is the set of spellings that still count as a content
// container: bare `<main>`, `<main class="x">`, `<article>`, `role="main"` and
// `id="content"` / `"main"` / `"main-content"` / `"primary"`.

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

// The block texts, which is what the reader sees.
const texts = (html) => extract(html).blocks.map((b) => b.text);

// A page whose content container is the only thing worth showing, wrapped in chrome that must
// not reach the preview.
const page = (container) => '<header>menu</header>' + container + '<footer>footer</footer>';

module.exports = {
  name: 'bug16: a > inside a quoted attribute does not truncate the body container',
  run() {
    section('the case from the report: a double-quoted value holding >', () => {
      assert.deepEqual(texts('<main data-x="a>b"><p>in</p></main>'), ['in']);
      // The exact garbage the truncated body produced, spelled out so a regression that
      // reintroduces it fails on the text and not only on the count.
      assert.deepEqual(texts('<main data-x="a>b"><p>in</p></main>').filter((t) => t.indexOf('b">') >= 0),
        [], 'the rest of the attribute leaked into the body');
    });

    section('the same in single quotes', () => {
      assert.deepEqual(texts("<main data-x='a>b'><p>in</p></main>"), ['in']);
      assert.deepEqual(texts("<main data-x='a>b'><p>in</p></main>").filter((t) => t.indexOf("b'>") >= 0), []);
    });

    section('several > inside one value', () => {
      assert.deepEqual(texts('<main title="x>y>z"><p>in</p></main>'), ['in']);
      assert.deepEqual(texts('<main data-x="a>b" data-y="c>d"><p>in</p></main>'), ['in']);
    });

    section('the role and id spellings are affected the same way', () => {
      // The attribute that names the container and the attribute holding the `>` may come in
      // either order, so both directions are checked.
      assert.deepEqual(texts('<div role="main" data-x="a>b"><p>in</p></div>'), ['in']);
      assert.deepEqual(texts('<div id="content" data-x="a>b"><p>in</p></div>'), ['in']);
      // The other order fails differently and just as badly: with `[^>]*` the container
      // attribute is unreachable once the value holding `>` is in front of it, so no opener
      // matched at all and the chrome came through with the prose.
      assert.deepEqual(texts(page('<div data-x="a>b" role="main"><p>in</p></div>')), ['in']);
      assert.deepEqual(texts(page('<div data-x="a>b" id="content"><p>in</p></div>')), ['in']);
    });

    section('the chrome around the container stays out', () => {
      assert.deepEqual(texts(page('<main data-x="a>b"><p>in</p></main>')), ['in']);
      assert.deepEqual(texts(page('<article data-x="a>b"><p>in</p></article>')), ['in']);
    });

    section('a nested container with a > in its own attribute does not throw the depth off', () => {
      // The closer search counts same-name tags, and a tag it misreads as ending early is one
      // it counts wrong: the body was sliced at the inner `</div>` and the outer one leaked.
      assert.deepEqual(
        texts('<div id="content" data-x="a>b"><div data-y="c>d"><p>in</p></div></div><p>out</p>'),
        ['in'],
      );
      assert.deepEqual(texts('<main data-x="a>b"><div><p>in</p></div></main>'), ['in']);
      assert.deepEqual(texts('<main data-x="a>b"><main>inner</main></main>'), ['inner']);
      // A closer-looking string inside a value is a value, not a closer.
      assert.deepEqual(texts('<main><div data-x="</main>"><p>in</p></div></main>'), ['in']);
    });

    // The depth count reads tags, and a tag-looking string inside a value is not a tag: if it
    // were counted, the extra depth would hide the real closer and the body would run past it.
    section('a tag-looking string inside a value does not throw the depth off', () => {
      assert.deepEqual(
        texts('<main><div data-x="<main>z</main>">x</div></main><p>after</p>'),
        ['x'],
      );
      assert.deepEqual(
        texts('<div id="content"><div data-x="<div>q</div>">x</div><p>after</p></div>'),
        ['x', 'after'],
      );
    });

    // The attribute search reads attributes, not the raw text: a `role="main"` spelling that
    // only exists inside another attribute's value is prose, not a declaration. Getting this
    // wrong turns an ordinary div into a container and cuts the chrome off around it.
    section('a role-looking string inside another value is not a container', () => {
      assert.deepEqual(texts(page('<div data-x="role=\'main\'"><p>in</p></div>')), ['menu', 'in', 'footer']);
      assert.deepEqual(texts(page('<div data-x="a>b role=\'main\'"><p>in</p></div>')), ['menu', 'in', 'footer']);
      assert.deepEqual(texts(page('<div data-x="id=\'content\'"><p>in</p></div>')), ['menu', 'in', 'footer']);
      assert.deepEqual(texts(page('<div title="role = \'main\'"><p>in</p></div>')), ['menu', 'in', 'footer']);
    });

    section('a container the page never closes is skipped, not sliced open-ended', () => {
      // The old code fell through to the next opener when no closer came; that behaviour is
      // kept, and with the quoted `>` it now has to reach the same verdict.
      assert.deepEqual(texts('<main data-x="a>b"></main><article><p>art</p></article>'), ['art']);
      assert.deepEqual(texts('<main data-x="a>b"><p>in</p></main>trailing'), ['in']);
    });

    section('normal containers do not regress', () => {
      assert.deepEqual(texts('<main><p>in</p></main>'), ['in']);
      assert.deepEqual(texts('<main class="x"><p>in</p></main>'), ['in']);
      assert.deepEqual(texts('<MAIN class="x"><p>in</p></MAIN>'), ['in']);
      assert.deepEqual(texts('<article><p>in</p></article>'), ['in']);
      assert.deepEqual(texts('<article class="post"><p>in</p></article>'), ['in']);
      assert.deepEqual(texts('<div role="main"><p>in</p></div>'), ['in']);
      assert.deepEqual(texts("<div role='main'><p>in</p></div>"), ['in']);
      assert.deepEqual(texts('<div id="content"><p>in</p></div>'), ['in']);
      assert.deepEqual(texts('<div id="main"><p>in</p></div>'), ['in']);
      assert.deepEqual(texts('<div id="main-content"><p>in</p></div>'), ['in']);
      assert.deepEqual(texts('<div id="primary"><p>in</p></div>'), ['in']);
      // And the chrome exclusion still works for them.
      assert.deepEqual(texts(page('<main><p>in</p></main>')), ['in']);
      assert.deepEqual(texts(page('<article><p>in</p></article>')), ['in']);
      // The `role` / `id` spellings are for *elements*, and the set of element names that
      // accepted them is part of the behaviour: a heading that happens to carry `id="content"`
      // must not become the body, or the prose under it would vanish from the preview.
      assert.deepEqual(texts(page('<h1 id="content">title</h1><p>body</p>')), ['menu', 'title', 'body', 'footer']);
      assert.deepEqual(texts(page('<h1 role="main">title</h1><p>body</p>')), ['menu', 'title', 'body', 'footer']);
      // Hyphenated custom elements were accepted before, so they still are.
      assert.deepEqual(texts(page('<my-div role="main"><p>in</p></my-div><p>out</p>')), ['in']);
      // `<main-x>` is not `<main>`: the name has to end there.
      assert.deepEqual(texts('<main-x><p>in</p></main-x><p>out</p>'), ['in']);
    });

    section('a page with no container is still the whole page', () => {
      assert.deepEqual(texts('<div><p>a</p></div><div><p>b</p></div>'), ['a', 'b']);
    });

    // The closer spelling is the one the old pattern accepted: `</name>` with nothing between
    // the name and the `>` but whitespace. `</name/>` and `</name class="x">` are malformed
    // closers the old code did not count, so it fell back to the whole page; counting them now
    // would end the body earlier than before and drop the prose behind them. A preview that
    // loses text is worse than one that shows the chrome, so the narrow spelling is kept.
    section('a malformed closer does not end the body earlier than it used to', () => {
      assert.deepEqual(texts('<main><p>in</p></main/><p>out</p>'), ['in', 'out']);
      assert.deepEqual(texts('<main><p>in</p></main class="x"><p>out</p>'), ['in', 'out']);
      assert.deepEqual(texts('<div id="content"><p>in</p></div/><p>out</p>'), ['in', 'out']);
      // The spellings the old pattern did accept still close the body.
      assert.deepEqual(texts('<main><p>in</p></main><p>out</p>'), ['in']);
      assert.deepEqual(texts('<main><p>in</p></main ><p>out</p>'), ['in']);
      assert.deepEqual(texts('<main><p>in</p></main\n><p>out</p>'), ['in']);
    });

    // An attribute *named* `role` is a role declaration; `data-role="main"` is not one, and
    // neither is `xml:id="content"`. The old regexes matched the text `role=` / `id=` anywhere
    // in the tag, so a `data-role="main"` page was read as declaring a container. Reading
    // attributes by name drops those false positives — the same defect the report files as its
    // next item, so the direction is the one the project is already moving in. The visible
    // effect is that such a page no longer loses its chrome: with no real container it is
    // previewed whole, which is the documented fallback.
    section('an attribute merely ending in role or id is not a container', () => {
      for (const attrs of ['data-role="main"', 'aria-role="main"', 'data-id="content"', 'xml:id="content"']) {
        assert.deepEqual(texts(page('<div ' + attrs + '><p>body</p></div>')), ['menu', 'body', 'footer'],
          attrs + ' was read as a container');
      }
      // A repeated attribute is read by name too, and the first spelling wins. No real page
      // writes both, so this only has to not crash and not invent a container.
      assert.deepEqual(texts(page('<div role="x" role="main"><p>body</p></div>')), ['menu', 'body', 'footer']);
    });

    // A malformed tag whose quote is unbalanced makes the tag scanner swallow the real `>`, so
    // the attribute text handed to the `role` / `id` reader can contain a `>`. The reader walks
    // that text attribute by attribute, and an attribute it cannot make sense of has to advance
    // its cursor — otherwise the walk spins on the same character forever. These inputs used to
    // hang the plugin (no result, no error, a frozen preview), so they are pinned here: every
    // one of them has to return, and return the whole page, exactly as before the fix.
    section('an attribute text containing an angle bracket does not spin', () => {
      const stuck = [
        '<div role=main t="a"b"><p id="c>x</p></div>',
        '<div role=main title="a"b"><h1 id="a>t</h1></div>',
        "<article r:1 \"/\n&''<=>CONTENT</article>",
        '<main data-x="a"b"><p>in</p></main>',
        '<div hidden role="main"><p>in</p></div>',
      ];
      for (const html of stuck) {
        // The assertion is that this call returns at all; the expected texts differ per input.
        assert.doesNotThrow(() => texts(html));
      }
      // The two shapes that were hanging now read the same way the untouched code did.
      assert.deepEqual(texts('<div role=main t="a"b"><p id="c>x</p></div>'), ['x']);
      assert.deepEqual(texts('<div role=main title="a"b"><h1 id="a>t</h1></div>'), ['t']);
      // A valueless attribute must not swallow the one after it: `hidden` has no `=`, and
      // `role="main"` right behind it still makes the element the container. `page()` is what
      // makes this observable — a container that is missed shows the page chrome instead.
      assert.deepEqual(texts(page('<div hidden role="main"><p>in</p></div>')), ['in']);
      assert.deepEqual(texts(page('<div data-x role="main"><p>in</p></div>')), ['in']);
      assert.deepEqual(texts(page('<div disabled hidden role="main"><p>in</p></div>')), ['in']);
      assert.deepEqual(texts(page('<div hidden id="content"><p>in</p></div>')), ['in']);
    });

    // Namespaced names were accepted before this fix — the old `[a-z]+\b` name test stopped at
    // the colon, so `<svg:rect role="main">` and Word's `<o:p role="main">` counted as
    // containers — and they still are. The body search reads tags with its own scanner for
    // exactly this reason: `scanTag` stops at the colon (a `<pre>` showing `<svg:rect/>` must
    // keep it as text), and reusing it here would silently drop both spellings.
    section('namespaced tag names still count as containers', () => {
      assert.deepEqual(texts(page('<svg:rect role="main"><p>in</p></svg:rect><p>out</p>')), ['in']);
      assert.deepEqual(texts(page('<svg:rect id="content"><p>in</p></svg:rect><p>out</p>')), ['in']);
      assert.deepEqual(texts(page('<o:p role="main"><p>in</p></o:p><p>out</p>')), ['in']);
      assert.deepEqual(texts(page('<o:p id="content"><p>in</p></o:p><p>out</p>')), ['in']);
      // A `>` inside a namespaced tag's attribute is the same defect and the same fix.
      assert.deepEqual(texts(page('<svg:rect role="main" data-x="a>b"><p>in</p></svg:rect>')), ['in']);
    });
  },
};
