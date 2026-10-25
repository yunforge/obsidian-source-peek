'use strict';

// An unclosed `<code>` must not colour the rest of the page.
//
// `walkBlocks` counted inline `<code>` elements in `codeDepth` and only ever decremented on a
// literal `</code>`, while no block boundary reset the count. The tags the function already
// knows are broken — a `<p>` closed by the next `<p>`-like opener, a list item ended by the
// next `<li>`, a document that simply stops — therefore leaked the count into every block
// after them, so the report's rows came back with whole paragraphs, headings and list items
// marked `code: true`:
//
//   <p>x</p><p>a <code>b</p><p>c</p>          third block  p:"c"   all code
//   <p>x <code>y</p><h2>H</h2><p>z</p>       the h2 and the p after it, all code
//   <ul><li>a <code>b</li><li>c</li></ul>    the second li, all code
//
// HTML agrees with the fix rather than with the old behaviour: an inline element is closed by
// the end of the block it sits in, and the renderer draws `parts[i].code` as a chip, so a
// stray tag in one paragraph was painting unrelated prose in a different one as code.
//
// The `<pre>` path is deliberately untouched — a `<pre>`'s text is code for its own reasons —
// so the last section pins it, `parts: [{ text: …, code: true }]` and all.

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

const kinds = (result) => result.blocks.map((b) => (b.level === undefined ? b.type : b.type + b.level));
// Every part of a block, so a test can say "nothing here is code" without repeating the list.
const partsOf = (result, i) => result.blocks[i].parts;

module.exports = {
  name: 'bug07: an unclosed inline <code> stops at its block',
  run() {
    // --- the report's reproduction, row by row ---

    section('an unclosed <code> does not colour the paragraphs after it', () => {
      const result = extract('<p>x</p><p>a <code>b</p><p>c</p>');
      assert.deepEqual(kinds(result), ['p', 'p', 'p'], 'three paragraphs');
      assert.deepEqual(result.blocks[0], { type: 'p', text: 'x' });

      // The paragraph that held the tag keeps it: the words after `<code>` are code up to the
      // paragraph's own end.
      assert.equal(result.blocks[1].text, 'a b');
      assert.deepEqual(partsOf(result, 1), [
        { text: 'a ', code: false },
        { text: 'b', code: true },
      ], 'the tag is honoured inside the block it opened in');

      // The bug: this block used to be `{text: 'c', parts: [{text: 'c', code: true}]}`.
      assert.deepEqual(result.blocks[2], { type: 'p', text: 'c' }, 'the next paragraph is plain text');
    });

    section('an unclosed <code> does not colour the heading after it', () => {
      const result = extract('<p>x <code>y</p><h2>H</h2><p>z</p>');
      assert.deepEqual(kinds(result), ['p', 'h2', 'p']);
      assert.deepEqual(partsOf(result, 0), [
        { text: 'x ', code: false },
        { text: 'y', code: true },
      ], 'the paragraph keeps its own inline code');
      // Both of these carried `parts: [{…, code: true}]` before the fix.
      assert.deepEqual(result.blocks[1], { type: 'h', level: 2, text: 'H' }, 'the heading is not code');
      assert.deepEqual(result.blocks[2], { type: 'p', text: 'z' }, 'neither is the paragraph after it');
    });

    section('an unclosed <code> does not colour the next list item', () => {
      const result = extract('<ul><li>a <code>b</li><li>c</li></ul>');
      assert.deepEqual(kinds(result), ['li', 'li'], 'two list items');
      assert.deepEqual(partsOf(result, 0), [
        { text: 'a ', code: false },
        { text: 'b', code: true },
      ], 'the first item keeps its own inline code');
      assert.deepEqual(result.blocks[1], { type: 'li', text: 'c' }, 'the second item is plain text');
    });

    // --- the same boundary in the other shapes the walker already knows ---

    section('an unclosed <code> does not colour a blockquote\'s successors', () => {
      const result = extract('<blockquote>a <code>b</blockquote><p>c</p>');
      assert.deepEqual(kinds(result), ['quote', 'p']);
      assert.deepEqual(partsOf(result, 0), [
        { text: 'a ', code: false },
        { text: 'b', code: true },
      ]);
      assert.deepEqual(result.blocks[1], { type: 'p', text: 'c' });
    });

    section('an implied close ends the inline code too', () => {
      // `<p>` opened inside a `<p>` and `<h*>` opened inside an `<h*>` are closed by the walker
      // rather than by a matching end tag, so they are a separate path from `</p>`.
      const paras = extract('<p>a <code>b<p>c');
      assert.deepEqual(kinds(paras), ['p', 'p']);
      assert.deepEqual(paras.blocks[1], { type: 'p', text: 'c' });

      const heads = extract('<h2>a <code>b</h3><h2>c</h2>');
      assert.deepEqual(kinds(heads), ['h2', 'h2']);
      assert.deepEqual(heads.blocks[1], { type: 'h', level: 2, text: 'c' });
    });

    section('a <code> left open at the end of the document stops there', () => {
      // The tail after the last tag is a block of its own; it must not stay "inside" the code.
      const result = extract('<p>a</p>tail <code>z');
      assert.deepEqual(kinds(result), ['p', 'p']);
      assert.deepEqual(result.blocks[0], { type: 'p', text: 'a' });
      assert.deepEqual(result.blocks[1].parts, [
        { text: 'tail ', code: false },
        { text: 'z', code: true },
      ]);
    });

    // --- the ordinary case, which must not have moved ---

    section('a closed <code>…</code> is still inline code', () => {
      const result = extract('<p>Run <code>npm install</code> first, then <code>npm test</code>.</p>');
      assert.equal(result.blocks.length, 1);
      assert.equal(result.blocks[0].text, 'Run npm install first, then npm test.');
      assert.deepEqual(result.blocks[0].parts, [
        { text: 'Run ', code: false },
        { text: 'npm install', code: true },
        { text: ' first, then ', code: false },
        { text: 'npm test', code: true },
        { text: '.', code: false },
      ], 'both spans are marked, the prose between them is not');
    });

    section('a closed <code> around prose containing angle brackets', () => {
      // The report's "must keep working" row: a properly closed tag inside one block.
      const result = extract('<p>see <code>a &lt; b</code></p>');
      assert.deepEqual(result.blocks[0].parts, [
        { text: 'see ', code: false },
        { text: 'a < b', code: true },
      ]);
    });

    section('a paragraph with no code carries no parts at all', () => {
      const result = extract('<p>a</p><p>just words</p>');
      assert.equal(result.blocks[1].parts, undefined, 'nothing to render specially');
    });

    // --- the <pre> path, which this fix does not touch ---

    section('a <pre> is still one code run, and an unclosed <code> cannot reach it', () => {
      const block = extract('<pre><code>line1\n  line2</code></pre>').blocks[0];
      assert.deepEqual(block, { type: 'pre', text: 'line1\n  line2' });

      // A <pre> in a blockquote is code because it is a <pre>, not because of codeDepth.
      const quoted = extract('<blockquote><pre>if (a &lt; b)\n  go();</pre></blockquote>');
      assert.deepEqual(quoted.blocks, [{
        type: 'quote',
        text: 'if (a < b)\n  go();',
        parts: [{ text: 'if (a < b)\n  go();', code: true }],
      }]);

      // A stray inline <code> in the first paragraph must not repaint the code block as inline
      // code — a `pre` block's `code` run is its own, and its text comes through verbatim.
      const after = extract('<p>a <code>b</p><pre>x\ny</pre><p>c</p>');
      assert.deepEqual(kinds(after), ['p', 'pre', 'p']);
      assert.deepEqual(after.blocks[1], { type: 'pre', text: 'x\ny' }, 'the pre is unchanged');
      assert.deepEqual(after.blocks[2], { type: 'p', text: 'c' }, 'and the paragraph after it is plain');
    });

    // --- stray end tags are not a new failure ---

    section('a stray </code> with no opener changes nothing', () => {
      const result = extract('<p>a</code>b</p>');
      assert.deepEqual(result.blocks, [{ type: 'p', text: 'ab' }]);
    });
  },
};
