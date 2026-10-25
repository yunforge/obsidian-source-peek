'use strict';

// bug28: a <pre>'s language was read from anywhere. The backward 400-character scan matched
// every `<div|figure|section|table ...>` opener in the window whether it was still open
// around this block or had closed before it — so one wrapper's language leaked onto every
// later <pre> on the page. And the code body itself was searched: `<pre>use language-java
// for that</pre>` declared itself Java, because the words are indistinguishable from a
// declaration to a plain substring search.
//
// Now the body is read only where a declaration can live — inside a tag's attribute region
// (the <code> element) — and a wrapper speaks only while it is still open around the block,
// counted by name the way matching brackets would be.

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

const langs = (html) =>
  extract(html).blocks.filter((b) => b.type === 'pre').map((b) => b.lang || '');

module.exports = {
  name: 'bug28: a pre\'s language comes from real declarations near it, not from its body or its neighbours',
  run() {
    section('the code body is not a language declaration', () => {
      assert.deepEqual(langs('<pre>use language-java for that</pre>'), ['']);
      assert.deepEqual(langs('<pre>the brush: js syntax</pre>'), ['']);
      // The text is still there, intact.
      assert.deepEqual(
        extract('<pre>use language-java for that</pre>').blocks.map((b) => b.text),
        ['use language-java for that']);
    });

    section('a wrapper that closed before the block does not lend its language', () => {
      assert.deepEqual(langs('<div class="highlight-python"><pre>a</pre></div><pre>b</pre>'),
        ['python', '']);
      // Sphinx's real shape: the outer div declares, the inner one does not. (python3
      // normalizes to python — the version digit is not part of the grammar name.)
      assert.deepEqual(langs('<div class="highlight-python3"><div class="highlight"><pre>x</pre></div></div>'),
        ['python']);
    });

    section('a still-open wrapper chain names the language, innermost outwards', () => {
      // The outer div declares, the inner one does not — and a wrapper two levels up is
      // still found when the level between it and the block is silent.
      assert.deepEqual(langs('<div class="highlight-python3"><div class="highlight"><pre>x</pre></div></div>'),
        ['python']);
      // A non-wrapper element in between changes nothing.
      assert.deepEqual(langs('<figure class="language-rust"><div><pre>c</pre></div></figure>'),
        ['rust']);
    });

    section('declarations that were always legitimate keep working', () => {
      assert.deepEqual(langs('<pre class="brush: js">x</pre>'), ['javascript']);
      assert.deepEqual(langs('<pre><code class="language-python">x</code></pre>'), ['python']);
      assert.deepEqual(langs('<pre class="language-go">x</pre>'), ['go']);
      // Comparisons in the body are not tags, and the body is not scanned anyway.
      assert.deepEqual(langs('<pre>if (a < b) { keep < this > int }</pre>'), ['']);
      assert.deepEqual(
        extract('<pre>if (a < b) { keep < this > int }</pre>').blocks.map((b) => b.text),
        ['if (a < b) { keep < this > int }']);
    });

    section('nested same-name wrappers: only the still-open chain counts', () => {
      // `zig` is not in the alias table, so the raw name survives — easier to tell apart
      // from anything a leak would produce.
      assert.deepEqual(
        langs('<div class="lang-zig"><div><pre>a</pre></div></div><div><pre>b</pre></div>'),
        ['zig', '']);
    });
  },
};
