'use strict';

// Page extraction: the HTML half of the plugin, tested without a network.

const assert = require('assert/strict');
const { extract } = require('../src/web');

module.exports = {
  name: 'web: extract',
  run() {
    const texts = (r) => r.blocks.map((b) => b.text);
    const kinds = (r) => r.blocks.map((b) => (b.level === undefined ? b.type : b.type + b.level));

    // --- title ---
    assert.equal(extract('<head><title>Install Guide</title></head><body><p>Hi</p></body>').title, 'Install Guide');
    assert.equal(extract('<title>Install\n   Guide</title>').title, 'Install Guide');
    assert.equal(extract('<title>A &amp; B</title>').title, 'A & B');
    assert.equal(extract('<p>no title here</p>').title, '');

    // --- head noise dropped, script/style/comment stripped ---
    const head = extract('<head><title>T</title><meta name="x" content="y"><style>p{color:red}</style></head><body><p>body text</p></body>');
    assert.equal(head.title, 'T');
    assert.deepEqual(head.blocks, [{ type: 'p', text: 'body text' }]);
    assert.deepEqual(
      extract('<p>a</p><script>var x = "<p>nope</p>";</script><style>.a{}</style><noscript>off</noscript><!-- <p>gone</p> --><p>b</p>').blocks,
      [{ type: 'p', text: 'a' }, { type: 'p', text: 'b' }],
    );

    // --- h1..h6 levels ---
    const levels = extract('<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>');
    assert.deepEqual(levels.blocks.map((b) => b.level), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(kinds(levels), ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

    // --- entities, <br>, whitespace collapse ---
    const text = extract('<p>A &amp; B &lt;tag&gt; &quot;q&quot; &#39;s&#39;&nbsp;end</p><p>x<br>y</p>');
    assert.equal(text.blocks[0].text, 'A & B <tag> "q" \'s\' end');
    assert.equal(text.blocks[1].text, 'x\ny');
    assert.equal(extract('<p>  lots   of\n\n   space </p>').blocks[0].text, 'lots of space');

    // --- <pre> keeps its newlines ---
    assert.deepEqual(extract('<pre><code>line1\n  line2\n\nline3</code></pre>').blocks,
      [{ type: 'pre', text: 'line1\n  line2\n\nline3' }]);

    // --- li / blockquote / loose text ---
    assert.deepEqual(kinds(extract('<ul><li>first</li><li>second</li></ul><blockquote>quoted</blockquote>')), ['li', 'li', 'quote']);
    assert.deepEqual(extract('hello <b>world</b>').blocks, [{ type: 'p', text: 'hello world' }]);

    // --- inline code is marked, so the renderer can draw it as code ---
    const inline = extract('<p>Run <code>npm install</code> first, then <code>npm test</code>.</p>');
    assert.equal(inline.blocks.length, 1);
    assert.equal(inline.blocks[0].text, 'Run npm install first, then npm test.', 'plain text is unchanged');
    assert.deepEqual(inline.blocks[0].parts, [
      { text: 'Run ', code: false },
      { text: 'npm install', code: true },
      { text: ' first, then ', code: false },
      { text: 'npm test', code: true },
      { text: '.', code: false },
    ], 'inline code is marked as its own run');

    // A paragraph with no code carries no parts at all — nothing to render specially.
    assert.equal(extract('<p>just words</p>').blocks[0].parts, undefined);

    // Entities inside inline code are decoded like anywhere else.
    assert.deepEqual(extract('<p>use <code>a &amp;&amp; b</code></p>').blocks[0].parts, [
      { text: 'use ', code: false },
      { text: 'a && b', code: true },
    ]);

    // --- a code block keeps its language ---
    const py = extract('<pre><code class="language-python">def f(x):\n    return x</code></pre>');
    assert.equal(py.blocks[0].type, 'pre');
    assert.equal(py.blocks[0].lang, 'python');
    assert.equal(py.blocks[0].text, 'def f(x):\n    return x', 'code spacing is preserved');

    // The spellings documentation sites actually use.
    assert.equal(extract('<pre class="brush: js notranslate"><code>x</code></pre>').blocks[0].lang, 'javascript');
    assert.equal(extract('<pre data-lang="go"><code>x</code></pre>').blocks[0].lang, 'go');
    assert.equal(extract('<pre><code class="lang-rust">x</code></pre>').blocks[0].lang, 'rust');

    // Sphinx, and so the Python docs, puts it on a wrapper div two levels up.
    assert.equal(
      extract('<div class="highlight-python3 notranslate"><div class="highlight"><pre><span></span><code>x</code></pre></div></div>').blocks[0].lang,
      'python',
      'the language is found on an outer wrapper, with the version digit trimmed',
    );

    // A block that names no language is still a code block; it just is not coloured.
    const plain = extract('<pre><code>echo hi</code></pre>');
    assert.equal(plain.blocks[0].type, 'pre');
    assert.equal(plain.blocks[0].lang, undefined);

    // --- heading hit: slug match, stops at the next same-or-higher heading ---
    const hit = extract('<h1>Docs</h1><h2>Install</h2><p>i1</p><p>i2</p><h2>Usage</h2><p>u1</p>', 'install');
    assert.equal(hit.headingMiss, false);
    assert.deepEqual(texts(hit), ['Install', 'i1', 'i2']);

    // --- nested: h3 continues, sibling h2 stops ---
    assert.deepEqual(texts(extract('<h2>Install</h2><p>i1</p><h3>Deep</h3><p>d1</p><h2>Other</h2><p>o1</p>', 'install')),
      ['Install', 'i1', 'Deep', 'd1']);

    // --- case / punctuation / percent-encoding ---
    assert.deepEqual(texts(extract('<h2>Install &amp; Setup</h2><p>body</p><h2>Next</h2>', 'install-setup')), ['Install & Setup', 'body']);
    // The fragment arrives here already decoded (parse.js owns the single decode — bug30):
    // a link written `#Getting%20Started` reaches this layer as "Getting Started". The
    // encoded spelling resolving end to end is pinned in bug30's test.
    assert.deepEqual(texts(extract('<h2>Getting Started</h2><p>g</p>', 'Getting Started')), ['Getting Started', 'g']);
    assert.deepEqual(texts(extract('<h2>Install Setup</h2><p>s</p>', 'install-setup')), ['Install Setup', 's']);
    assert.deepEqual(texts(extract('<h2>!!</h2><p>x</p>', '!!')), ['!!', 'x']);

    // --- miss -> headingMiss, and nothing else ---
    // The link asked for one section. Falling back to the whole page would answer a
    // question nobody asked, so a miss draws no blocks at all.
    const miss = extract('<h1>A</h1><p>b</p>', 'nope');
    assert.equal(miss.headingMiss, true);
    assert.deepEqual(texts(miss), [], 'a miss shows no blocks');
    assert.equal(miss.title, '', 'the title is not collected either when the page was dropped');

    // --- empty heading -> whole page, no miss ---
    const all = extract('<h1>A</h1><p>b</p>', '');
    assert.equal(all.headingMiss, false);
    assert.deepEqual(texts(all), ['A', 'b']);

    // --- maxBlocks truncation ---
    const cut = extract('<p>1</p><p>2</p><p>3</p>', '', 2);
    assert.equal(cut.blocks.length, 2);
    assert.equal(cut.truncated, true);
    assert.equal(extract('<p>1</p>', '', 2).truncated, false);

    // --- empty html ---
    const empty = extract('');
    assert.deepEqual(empty.blocks, []);
    assert.equal(empty.error, '');
    assert.equal(empty.title, '');
    assert.equal(empty.truncated, false);
    assert.equal(empty.headingMiss, false);

    // --- text after the last tag, and blocks left open at the end ---
    // A page does not always end on a closing tag; it ends on prose. Everything from the
    // last tag to the end of the source is gathered too, and a block that never saw its
    // closer still has content worth showing.
    assert.deepEqual(extract('<p>a</p>trailing words').blocks,
      [{ type: 'p', text: 'a' }, { type: 'p', text: 'trailing words' }],
      'text after the last tag is kept, and comes after that tag');
    assert.deepEqual(extract('<p>unclosed').blocks,
      [{ type: 'p', text: 'unclosed' }],
      'a block whose closer never arrives is still emitted');
    assert.deepEqual(extract('hello world').blocks,
      [{ type: 'p', text: 'hello world' }],
      'a document with no tags at all is one paragraph');

    // The same shapes inside a real article container: the tail must survive the body
    // being cut out of the page, not just the top-level walk.
    assert.deepEqual(texts(extract('<html><body><article><p>a</p>trailing words</article></body></html>')),
      ['a', 'trailing words']);
    assert.deepEqual(texts(extract('<html><body><article>hello world</article></body></html>')),
      ['hello world']);

    // The tail is gathered before anything still open is closed, so with more than one block
    // ahead of it the text still lands last. Moving the gathering below the closing loop would
    // pass the single-block cases above and fail here.
    assert.deepEqual(texts(extract('<p>1</p><blockquote>2</blockquote><ul><li>3</li></ul>tail')),
      ['1', '2', '3', 'tail']);
    assert.deepEqual(texts(extract('<div><p>1<blockquote>2')), ['1', '2']);

    // A document that does end on a tag is unchanged: the tail is empty, so nothing is
    // gathered after the last closer and no stray block appears.
    assert.deepEqual(extract('<p>a</p><p>b</p>').blocks,
      [{ type: 'p', text: 'a' }, { type: 'p', text: 'b' }]);
    assert.deepEqual(extract('<h1>T</h1><p>b</p>').blocks,
      [{ type: 'h', level: 1, text: 'T' }, { type: 'p', text: 'b' }]);
  },
};
