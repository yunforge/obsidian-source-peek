'use strict';

// Code blocks: what a <pre> is allowed to lose.
//
// The bug this covers: `extract` stripped every `<…>` from a code block, so a page showing
// `if (a < b) {}`, `vector<int>` or a highlighted token ate its own generics and comparisons.
// The rule now is that only *element* markup is dropped — the element table decides, which is
// also what a browser does — and entities are decoded afterwards, because a page explaining
// markup writes `&lt;span&gt;` and that is the text the reader came for.
//
// The second half of the file is the other direction, and it is the half that regressed twice:
// wrappers a highlighter leaves behind (per-line `<div>`, `<span class="token">`, `<font>` from
// a Word export, tags in either case) must not survive into the code.

const assert = require('assert/strict');
const { extract } = require('../src/web');

// The text of the page's code blocks, joined, so one assertion covers a whole page.
const code = (html) => extract(html).blocks.filter((b) => b.type === 'pre').map((b) => b.text).join('\n|\n');

module.exports = {
  name: 'web: code blocks keep their characters',
  run() {
    // --- the reported defect: angles inside <pre> survive ---
    // The page's own spelling, and the unescaped spelling a hand-written page uses. Both are
    // the same code to a reader; only the entity decoding differs.
    assert.equal(code('<pre>x &lt; y &gt; z</pre>'), 'x < y > z');
    assert.equal(code('<pre>x < y > z</pre>'), 'x < y > z', 'an unescaped comparison is not a tag');
    assert.equal(code('<pre>vector&lt;int&gt; v;</pre>'), 'vector<int> v;');
    assert.equal(code('<pre>a &lt; b &gt; c</pre>'), 'a < b > c');
    assert.equal(code('<pre>List&lt;String&gt; xs;</pre>'), 'List<String> xs;');
    // Escaped or not, a type parameter is not an element.
    assert.equal(code('<pre>Map<String, List<Integer>> m = new HashMap<>();</pre>'),
      'Map<String, List<Integer>> m = new HashMap<>();');

    // --- indentation is the point of a <pre>, so it is kept as written ---
    const indented = '<pre>if (a &lt; b) {\n    sum += a[i];\n\tif (c) {\n\t\tgo();\n\t}\n}</pre>';
    assert.equal(code(indented), 'if (a < b) {\n    sum += a[i];\n\tif (c) {\n\t\tgo();\n\t}\n}');

    // --- token spans: the wrapper goes, its text stays ---
    assert.equal(code('<pre><code><span class="token keyword">if</span> (a &lt; b)</code></pre>'), 'if (a < b)');
    assert.equal(code('<pre><code class="language-js"><span class="token keyword">const</span> x <span class="token operator">=</span> <span class="token number">1</span>;</code></pre>'),
      'const x = 1;');
    // Attribute syntax is never parsed, so `@click`, `v-if` and `[ngClass]` are harmless.
    assert.equal(code('<pre><span @click="go" v-if="ok" :href="u" [ngClass]="c">go</span>()</pre>'), 'go()');
    assert.equal(code('<pre><span data-lsp="x">x</span> &lt; 3</pre>'), 'x < 3');
    assert.equal(code('<pre><x-code>const x = 1;</x-code></pre>'), 'const x = 1;');
    // A `>` inside an attribute value does not end the tag.
    assert.equal(code('<pre><span title="a>b">x</span></pre>'), 'x');

    // --- per-line wrappers: the newline is the code's, the wrapper is not ---
    // A highlighter that puts one wrapper per source line separates the lines with <br>, and
    // the newline survives while the wrappers do not.
    assert.equal(code('<pre><div class="token-line"><span>a</span></div><br><div class="token-line"><span>b</span></div></pre>'), 'a\nb');
    // A wrapper per line written *without* <br> carries no line information in the markup —
    // HTML itself would render it as `ab` — so the layout of the source is what says the lines
    // are separate. The wrappers still go.
    assert.equal(code('<pre>\n<div class="line">a</div>\n<div class="line">b</div>\n</pre>'), 'a\nb');
    // Written on one line and without <br>: nothing in the page says the two are separate.
    assert.equal(code('<pre><span class="line">a</span><span class="line">b</span></pre>'), 'ab');

    // --- old HTML: the whole element table, not just the familiar elements ---
    // A Word / old-CMS export wraps the block in <font> and breaks lines with <br>.
    assert.equal(
      code('<pre><font face="Courier New" size="2">for (i = 0; i &lt; n; i++) {<br>    sum += a[i];<br>}</font></pre>'),
      'for (i = 0; i < n; i++) {\n    sum += a[i];\n}',
    );
    assert.equal(code('<pre><tt>x &lt; y</tt></pre>'), 'x < y');
    assert.equal(code('<pre><center>a &lt; b</center></pre>'), 'a < b');
    assert.equal(code('<pre><big>B</big></pre>'), 'B');
    assert.equal(code('<pre><marquee><nobr>x &lt; y</nobr></marquee></pre>'), 'x < y');
    assert.equal(code('<pre><strike><listing>a &lt; b</listing></strike></pre>'), 'a < b');
    assert.equal(code('<pre><search>s</search><rb>r</rb><rtc>t</rtc><keygen>k</keygen></pre>'), 'srtk');
    // Inline SVG and MathML: an icon or formula next to the code is markup, its <text> too.
    assert.equal(code('<pre><svg><path d="M0 0"/><text>t</text></svg></pre>'), 't');
    assert.equal(code('<pre><math><mrow><mi>x</mi><mo>&lt;</mo><mi>y</mi></mrow></math></pre>'), 'x<y');

    // --- tag names are case-insensitive, exactly as in the parser around this one ---
    // `<B>` is `<b>`: a capitalised single letter is a tag when it names an element, and a type
    // parameter when it does not.
    assert.equal(code('<pre><B>Note:</B> i &lt; 10</pre>'), 'Note: i < 10');
    assert.equal(code('<pre><I>x</I><U>y</U><P>z</P></pre>'), 'xyz');
    assert.equal(code('<pre><DIV CLASS="x">a &lt; b</DIV></pre>'), 'a < b');
    assert.equal(code('<PRE>a &lt; b</PRE>'), 'a < b');
    assert.equal(code('<pre>fn f&lt;T&gt;(x: T) -&gt; T</pre>'), 'fn f<T>(x: T) -> T', '`T` is not an element');

    // --- a broken quote: drop the tag, keep the code, never leak half a tag ---
    // The reported baseline for this page was the text `y`; what matters is that no bare
    // `<div class=` fragment is left in the code.
    assert.equal(code('<pre><div class="x>y</div></pre>'), 'y');
    // A tag cut off mid-element takes only itself with it, not the rest of the block.
    assert.equal(code('<pre><span<i>j</span></pre>'), 'j');
    // An unclosed `<` inside a comparison is a comparison, not a broken tag.
    assert.equal(code('<pre>if (a<5 && b>2) go();</pre>'), 'if (a<5 && b>2) go();');
    // And a page cut off mid-element keeps every character it did deliver: with no `>` left to
    // resume at, the `<` is code rather than a tag to swallow, or the block would come back empty.
    assert.equal(code('<pre>a &lt; b\n<span class="oops</pre>'), 'a < b\n<span class="oops');
    assert.equal(code('<pre>abc<span</pre>'), 'abc<span');
    assert.equal(code('<pre>x<y<z</pre>'), 'x<y<z');

    // --- declarations: a comment goes, CDATA and processing instructions are markup ---
    assert.equal(code('<pre>a<!-- hidden -->b</pre>'), 'a b');
    assert.equal(code('<pre><![CDATA[if (a < b) { x(); }]]></pre>'), 'if (a < b) { x(); }', 'CDATA holds the code');
    assert.equal(code('<pre><?php echo "a < b"; ?><?xml version="1.0"?></pre>'), '', 'neither is code');

    // --- entities are decoded after the scan, so what was escaped reads as written ---
    assert.equal(code('<pre>it&#39;s &amp; done</pre>'), "it's & done");
    assert.equal(code('<pre>&#60;T&#62;</pre>'), '<T>');
    assert.equal(code('<pre><br/></pre>') , '', 'a lone <br> is a newline, and a block of one is empty');

    // --- a self-closing tag is a tag, whatever its name ---
    // The `/` before the `>` is the only thing marking these as elements, so it has to count as
    // a tag boundary: without it `<hr/>` is read as `a<hr` followed by code, and the element
    // itself leaks into the block instead of being removed.
    assert.equal(code('<pre>a<hr/>b</pre>'), 'ab');
    assert.equal(code('<pre>a<img src="x.png"/>b</pre>'), 'ab');
    assert.equal(code('<pre>a<x-foo/>b</pre>'), 'ab');
    // While a slash inside a comparison is still a division and not a boundary.
    assert.equal(code('<pre>if (a&lt;b/c) x();</pre>'), 'if (a<b/c) x();');

    // --- a code block in the middle of a paragraph is still code ---
    const quoted = extract('<blockquote><pre>if (a &lt; b)\n  go();</pre></blockquote>');
    assert.deepEqual(quoted.blocks, [{
      type: 'quote',
      text: 'if (a < b)\n  go();',
      parts: [{ text: 'if (a < b)\n  go();', code: true }],
    }]);
    // …and an inline <code> keeps its angles too.
    assert.deepEqual(extract('<p>see <code>a &lt; b</code></p>').blocks[0].parts, [
      { text: 'see ', code: false },
      { text: 'a < b', code: true },
    ]);
  },
};
