'use strict';

// bug31: `-install` — "the page up to that heading" — answered `{from: 0, to: 0, miss: ''}`
// when the heading was the page's first block. Zero blocks with no miss reads as SUCCESS,
// so the panel rendered blank instead of saying the stretch the link asked for does not
// exist. Nothing before the first heading is a miss like any other.

const assert = require('assert/strict');
const { selectBlocks, resolveRange } = require('../src/sections');
const { extract } = require('../src/web');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

const h = (text, level) => ({ type: 'h', level: level || 2, text });
const p = (text) => ({ type: 'p', text });

module.exports = {
  name: 'bug31: a before-heading stretch that has nothing before it is a miss',
  run() {
    section('the report repro: the heading is the first block', () => {
      const r = selectBlocks([h('Install'), p('i1')], '-install');
      assert.deepEqual(r.blocks, [], 'no blocks before it');
      assert.equal(r.miss, 'install', 'and it says so, rather than reading as success');
    });

    section('a middle heading keeps its stretch', () => {
      const blocks = [p('before'), h('Install'), p('i1'), h('Usage'), p('u1')];
      const r = selectBlocks(blocks, '-install');
      assert.equal(r.miss, '');
      assert.deepEqual(r.blocks, [p('before')]);
      // The heading one block in: exactly the block before it.
      const r2 = selectBlocks([p('a'), h('Mid'), p('b')], '-mid');
      assert.deepEqual(r2.blocks, [p('a')]);
    });

    section('a heading that does not exist at all still misses', () => {
      assert.equal(selectBlocks([p('a')], '-nope').miss, 'nope');
    });

    section('the other shapes are untouched', () => {
      const blocks = [h('Install'), p('i1'), h('Usage'), p('u1')];
      // From a heading to the end.
      const from = selectBlocks(blocks, 'install-');
      assert.equal(from.miss, '');
      assert.deepEqual(from.blocks, [h('Install'), p('i1'), h('Usage'), p('u1')]);
      // A plain heading.
      const exact = selectBlocks(blocks, 'usage');
      assert.deepEqual(exact.blocks, [h('Usage'), p('u1')]);
      // A range between two headings.
      const range = selectBlocks(blocks, 'install-usage');
      assert.deepEqual(range.blocks, [h('Install'), p('i1')]);
      // An empty prefix is the whole page, as documented.
      assert.equal(resolveRange(blocks, '-').from, 0);
      assert.equal(resolveRange(blocks, '-').to, blocks.length);
      // A fragment with no dash semantics looks itself up as before — and its slug strips
      // punctuation, so '+install' still resolves to the Install section.
      const plus = selectBlocks(blocks, '+install');
      assert.equal(plus.miss, '');
      assert.deepEqual(plus.blocks, [h('Install'), p('i1')]);
    });

    section('end to end: the panel reports the miss, not a blank', () => {
      const r = extract('<h2>Install</h2><p>i1</p>', '-install');
      assert.equal(r.headingMiss, true);
      assert.equal(r.missName, 'install');
      assert.deepEqual(r.blocks, []);
    });
  },
};
