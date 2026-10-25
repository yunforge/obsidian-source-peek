'use strict';

// Nested blocks must come out in the order the page reads them.
//
// A block kept its text until it closed, so everything nested inside it was emitted first and
// the block's own text followed the whole run: a quote's lead-in was drawn below the
// paragraph inside it. These cases pin the order of whole block sequences, not just their
// length, because the bug only ever changed the order.

const assert = require('assert/strict');
const { extract } = require('../src/web');

module.exports = {
  name: 'web: nested block order',
  run() {
    // [type, text] for each block, which compares order and content together.
    const seq = (html) => extract(html).blocks.map((b) => [b.type, b.text]);
    const kinds = (html) => extract(html).blocks.map((b) => b.type);

    // --- a paragraph inside a quote follows the quote's own text ---
    assert.deepStrictEqual(seq('<blockquote>text<p>para</p></blockquote>'), [
      ['quote', 'text'],
      ['p', 'para'],
    ]);

    // --- a list item left open by </ul> still ends before the paragraph after the list ---
    assert.deepStrictEqual(seq('<ul><li>a</ul><p>b</p>'), [
      ['li', 'a'],
      ['p', 'b'],
    ]);

    // --- a paragraph inside a list item sits between the item's text and the next item ---
    assert.deepStrictEqual(seq('<ul><li>one<p>nested</p></li><li>two</li></ul>'), [
      ['li', 'one'],
      ['p', 'nested'],
      ['li', 'two'],
    ]);

    // --- text either side of a nested block stays on its own side ---
    assert.deepStrictEqual(seq('<blockquote>a<p>b</p>c</blockquote>'), [
      ['quote', 'a'],
      ['p', 'b'],
      ['quote', 'c'],
    ]);
    assert.deepStrictEqual(seq('<blockquote>first<p>p1</p>second<p>p2</p>third</blockquote>'), [
      ['quote', 'first'],
      ['p', 'p1'],
      ['quote', 'second'],
      ['p', 'p2'],
      ['quote', 'third'],
    ]);

    // --- three levels: each block is read before the blocks nested in it, and the item that
    //     follows a nested quote continues the item rather than restarting it ---
    assert.deepStrictEqual(seq('<blockquote>A<ul><li>B<blockquote>C</blockquote>D</li></ul>E</blockquote>'), [
      ['quote', 'A'],
      ['li', 'B'],
      ['quote', 'C'],
      ['li', 'D'],
      ['quote', 'E'],
    ]);

    // --- a heading keeps its text ahead of a paragraph nested in it ---
    assert.deepStrictEqual(seq('<h2>A<p>b</p></h2>'), [
      ['h', 'A'],
      ['p', 'b'],
    ]);

    // --- inline markup does not split the text around it: the quote is still one block,
    //     and only blocks nested inside it are lifted out. A <span> is inline, so the text
    //     either side of it is one run; a <div> is a block and is separated (bug15) ---
    assert.deepStrictEqual(seq('<blockquote>lead text<span>inner</span>tail</blockquote>'), [
      ['quote', 'lead textinnertail'],
    ]);
    assert.deepStrictEqual(seq('<blockquote>lead text<div>inner</div>tail</blockquote>'), [
      ['quote', 'lead text inner tail'],
    ]);

    // --- a quote that holds only a paragraph adds no block of its own ---
    assert.deepStrictEqual(kinds('<blockquote><p>only para</p></blockquote>'), ['p']);

    // --- an item ended implicitly by the next one is unchanged ---
    assert.deepStrictEqual(kinds('<ul><li>a<li>b</ul>'), ['li', 'li']);
  },
};
