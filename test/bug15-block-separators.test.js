'use strict';

// bug15: neighbouring containers' text ran together with nothing between it.
//
// Text that no block is gathering collects into one buffer, and the buffer is flushed as a
// single paragraph when the next block-level element opens. Two adjacent containers — two
// `<div>`s, two table cells — therefore had their words concatenated: `<div>hello</div>
// <div>world</div>` came out as "helloworld" and `<td>a</td><td>b</td>` as "ab".
//
// The edges that need a break are the *block-level* ones, because that is where the page
// itself puts a visual break. Inline elements are the opposite case: they sit inside a word
// (`he<b>ll</b>o` is "hello"), so putting a space at their edges would break the words apart.
//
// The break is written lazily — recorded at the block-level edge and spent by the next text
// that arrives — so a container that ends the document leaves no trailing space behind, and
// a source space that is already there is not doubled.

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

// The code flags of the parts of the single block, so a separator can be checked to be part
// of the prose and not of a code run.
const codes = (html) => {
  const blocks = extract(html).blocks;
  assert.equal(blocks.length, 1, 'expected one block, got ' + JSON.stringify(blocks.map((b) => b.text)));
  return (blocks[0].parts || []).map((p) => p.code);
};

// The parts as `code?`-tagged strings, so it is visible which side of the boundary the
// separator ended up on: "a " + "b" is not the same rendering as "a" + " b".
const shape = (html) => {
  const blocks = extract(html).blocks;
  assert.equal(blocks.length, 1, 'expected one block, got ' + JSON.stringify(blocks.map((b) => b.text)));
  return (blocks[0].parts || []).map((p) => (p.code ? 'code:' : 'prose:') + JSON.stringify(p.text));
};

module.exports = {
  name: 'bug15: neighbouring blocks are separated, inline elements are not',
  run() {
    section('the case from the report', () => {
      assert.deepEqual(texts('<div>hello</div><div>world</div>'), ['hello world']);
      assert.deepEqual(texts('<table><tr><td>a</td><td>b</td></tr></table>'), ['a b']);
      // The report quotes the cells bare, with no table around them: a fragment lifted out of
      // a page has to behave the same way as the whole table.
      assert.deepEqual(texts('<td>a</td><td>b</td>'), ['a b']);
    });

    section('every block-level container separates from its neighbour', () => {
      assert.deepEqual(texts('<section>a</section><section>b</section>'), ['a b']);
      assert.deepEqual(texts('<table><tr><th>a</th><th>b</th></tr></table>'), ['a b']);
      assert.deepEqual(texts('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>'), ['a b']);
      assert.deepEqual(texts('<div>a</div><div>b</div><div>c</div>'), ['a b c']);
      assert.deepEqual(texts('<dl><dt>t</dt><dd>d</dd></dl>'), ['t d']);
      assert.deepEqual(texts('<header>a</header><footer>b</footer>'), ['a b']);
      assert.deepEqual(texts('<div>a</div><hr><div>b</div>'), ['a b']);
      // A real table header row, which is where this shows up on a documentation page.
      assert.deepEqual(
        texts('<table><thead><tr><th>Name</th><th>Value</th></tr></thead>'
          + '<tbody><tr><td>alpha</td><td>1</td></tr></tbody></table>'),
        ['Name Value alpha 1']);
    });

    section('inline elements never introduce a break', () => {
      // The counter-case named in the report: splitting this into "he llo" would be worse
      // than the bug.
      assert.deepEqual(texts('<p>he<b>ll</b>o</p>'), ['hello']);
      assert.deepEqual(texts('<div><span>a</span><span>b</span></div>'), ['ab']);
      assert.deepEqual(texts('<div><em>a</em><strong>b</strong><i>c</i></div>'), ['abc']);
      assert.deepEqual(texts('<p><a href="u">link</a>text</p>'), ['linktext']);
      assert.deepEqual(texts('<div>a<span>b</span>c</div>'), ['abc']);
    });

    section('a break is not added where one is already there', () => {
      // A source space between the containers is already a separator; it must not become two.
      assert.deepEqual(texts('<div>hello</div> <div>world</div>'), ['hello world']);
      assert.deepEqual(texts('<div>hello</div>\n<div>world</div>'), ['hello world']);
      assert.deepEqual(texts('<div>hello</div>   <div>world</div>'), ['hello world']);
      assert.deepEqual(texts('<div>a</div> <div>b</div> <div>c</div>'), ['a b c']);
    });

    section('a container at the edge of the document adds nothing', () => {
      // The break is only spent by text that follows it, so a trailing container leaves no
      // trailing space for the block trim to hide.
      assert.deepEqual(texts('<div>a</div>'), ['a']);
      assert.deepEqual(texts('<div>a</div><div></div>'), ['a']);
      assert.deepEqual(texts('<div>a</div><div></div><div>b</div>'), ['a b']);
    });

    section('a run of code counts as a word too', () => {
      // The separator belongs between the two runs, so it must survive the code part that
      // follows it — and it must not turn a code run into prose.
      assert.deepEqual(texts('<div><code>x</code></div><div>y</div>'), ['x y']);
      assert.deepEqual(codes('<div><code>x</code></div><div>y</div>'), [true, false]);
      assert.deepEqual(texts('<div>a</div><div><code>y</code></div>'), ['a y']);
      assert.deepEqual(codes('<div>a</div><div><code>y</code></div>'), [false, true]);
      // Between two code spans the separator is part of the code, not a prose gap drawn in
      // the middle of it: one run, "x y", and not three parts true/false/true.
      assert.deepEqual(codes('<code>x</code><div><code>y</code></div>'), [true]);
      assert.deepEqual(texts('<code>x</code><div><code>y</code></div>'), ['x y']);
      // But against prose it stays prose. Making it code unconditionally would draw a code
      // span with a leading (or trailing) space inside it, which is visible on the page, so
      // the separator has to land on the prose side of the boundary.
      assert.deepEqual(codes('<div>a</div><code>b</code>'), [false, true]);
      assert.deepEqual(shape('<div>a</div><code>b</code>'), ['prose:"a "', 'code:"b"']);
      assert.deepEqual(texts('<div>a</div><code>b</code>'), ['a b']);
      assert.deepEqual(codes('<code>a</code><div>b</div>'), [true, false]);
      assert.deepEqual(shape('<code>a</code><div>b</div>'), ['code:"a"', 'prose:" b"']);
      assert.deepEqual(texts('<code>a</code><div>b</div>'), ['a b']);
    });

    section('a space that is already there is not doubled', () => {
      // The source space after the code run is the separator; adding another one would show
      // up as two in the block's text, because collapsing happens per run and not across it.
      assert.deepEqual(texts('<code>x </code><div>y</div>'), ['x y']);
      assert.deepEqual(texts('<code>a</code> <div><code>b</code></div>'), ['a b']);
      assert.deepEqual(texts('<div><code>a</code></div> <div><code>b</code></div>'), ['a b']);
      assert.deepEqual(texts('<div><code>a</code></div><code> b</code>'), ['a b']);
      assert.deepEqual(texts('<div>a</div> <div><code>b</code></div>'), ['a b']);
    });

    section('a pre block separates from the text around it', () => {
      // <pre> is a block, so its edges are word boundaries too. The branch that reads it
      // verbatim swallows its own closing tag, which is why the boundary has to be set there
      // as well as at the generic block edge.
      assert.deepEqual(texts('<blockquote>intro<pre>code</pre>outro</blockquote>'),
        ['intro code outro']);
      assert.deepEqual(texts('<div>a<pre>code</pre>b</div>'), ['a', 'code', 'b']);
    });

    section('punctuation stays attached to the word before it', () => {
      // A block edge is a word boundary, but a comma is not a word: it belongs to what it
      // follows, so the break must not push it away from that word.
      assert.deepEqual(texts('<div>end</div>, more'), ['end, more']);
      assert.deepEqual(texts('<div>one</div>. Two'), ['one. Two']);
      assert.deepEqual(texts('<div>f(x)</div>) tail'), ['f(x)) tail']);
      // A word after the block still gets its separator.
      assert.deepEqual(texts('<div>a</div>b'), ['a b']);
    });

    section('a code block keeps its characters', () => {
      // The plugin's core feature: what is inside <pre> is code, and a token per line is
      // exactly the shape that would be destroyed by a separator.
      assert.deepEqual(texts('<pre><div class="token-line"><span>a</span></div>'
        + '<div class="token-line"><span>b</span></div></pre>'), ['ab']);
      assert.deepEqual(texts('<pre>if (a < b)\n  go();</pre>'), ['if (a < b)\n  go();']);
      assert.deepEqual(texts('<pre><code>x = 1</code></pre>'), ['x = 1']);
    });

    section('the shapes a real page has', () => {
      assert.deepEqual(texts('<div class="wrap"><div class="title">Title</div>'
        + '<div class="body">Text here</div></div>'), ['Title Text here']);
      // A block nested in a container that is itself a block keeps its own text intact: the
      // separator goes between the container's runs, not into them.
      assert.deepEqual(texts('<blockquote>lead <div>x</div> tail</blockquote>'), ['lead x tail']);
      assert.deepEqual(texts('<div><p>a</p><p>b</p></div>'), ['a', 'b']);
      assert.deepEqual(texts('<ul><li>a</li><li>b</li></ul>'), ['a', 'b']);
    });
    section('a long page stays linear', () => {
      // Reading the tail of a growing buffer on every block edge would make this quadratic:
      // at this size the quadratic version needs over a second, the linear one tens of ms.
      // The budget is loose enough to only trip on that order-of-magnitude regression.
      const count = 32000;
      let html = '';
      for (let i = 0; i < count; i++) html += '<div>item' + i + '</div>';
      const started = Date.now();
      const blocks = extract(html).blocks;
      const elapsed = Date.now() - started;
      assert.equal(blocks.length, 1);
      assert.equal(blocks[0].text, Array.from({ length: count }, (_, i) => 'item' + i).join(' '));
      assert.ok(elapsed < 800, 'extracting ' + count + ' blocks took ' + elapsed + 'ms');
    });
  },
};
