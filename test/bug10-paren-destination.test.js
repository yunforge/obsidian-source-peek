'use strict';

// bug10: a markdown destination may hold paired parentheses. `Foo_(bar)` is how Wikipedia and
// MDN write a good share of their pages, and stopping at the first `)` cut the URL short, so the
// preview asked for a page that does not exist.

const assert = require('assert/strict');
const { findTargets } = require('../src/parse');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

// The single hit on `text`, checked against the invariants every hit must keep: the raw
// destination rides inside the hit area, and the hit area covers the whole construct.
// (Destination offsets are no longer reported — hitStart/hitEnd are the contract, bug32-era
// dead02 cleanup.)
function only(text) {
  const found = findTargets(text);
  assert.equal(found.length, 1, 'one target on the line, got ' + found.length);
  const hit = found[0];
  assert.ok(text.slice(hit.hitStart, hit.hitEnd).includes(hit.raw), 'the raw destination rides inside the hit area');
  return hit;
}

module.exports = {
  name: 'bug10: a destination with paired parentheses keeps every character',
  run() {
    section('the reported Wikipedia link keeps its closing paren', () => {
      const text = 'see [wiki](https://en.wikipedia.org/wiki/Foo_(bar)) here';
      const hit = only(text);
      assert.equal(hit.raw, 'https://en.wikipedia.org/wiki/Foo_(bar)');
      assert.deepEqual(hit.target,
        { kind: 'web', url: 'https://en.wikipedia.org/wiki/Foo_(bar)', heading: '' });
      assert.equal(text.slice(hit.hitStart, hit.hitEnd), '[wiki](https://en.wikipedia.org/wiki/Foo_(bar))',
        'the whole link is the hit area');
    });

    section('the same destination with a heading fragment', () => {
      const hit = only('[mdn](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array_(x)#methods)');
      assert.deepEqual(hit.target, {
        kind: 'web',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array_(x)',
        heading: 'methods',
      });
    });

    section('nesting two levels deep is still one destination', () => {
      const hit = only('[n](https://en.wikipedia.org/wiki/A_(b_(c)))');
      assert.equal(hit.raw, 'https://en.wikipedia.org/wiki/A_(b_(c))');
      assert.equal(hit.target.url, 'https://en.wikipedia.org/wiki/A_(b_(c))');
    });

    section('a titled link holding parentheses keeps its title out of the destination', () => {
      const text = '[w](https://en.wikipedia.org/wiki/Foo_(bar) "the title")';
      const hit = only(text);
      assert.equal(hit.raw, 'https://en.wikipedia.org/wiki/Foo_(bar)');
      assert.equal(hit.target.url, 'https://en.wikipedia.org/wiki/Foo_(bar)');
      assert.equal(text.slice(hit.hitStart, hit.hitEnd), text, 'title is inside the hit area');
    });

    section('a code destination with parentheses and a line fragment', () => {
      const hit = only('[gen](../src/gen(v2)/main.c#L18-23)');
      assert.deepEqual(hit.target,
        { kind: 'code', source: 'local', path: '../src/gen(v2)/main.c', from: 18, to: 23 });
    });

    section('a destination wrapped in angle brackets keeps its spaces and drops the brackets', () => {
      const text = '[n](<../src/main.c#L18>)';
      const hit = only(text);
      assert.equal(hit.raw, '../src/main.c#L18');
      assert.deepEqual(hit.target,
        { kind: 'code', source: 'local', path: '../src/main.c', from: 18, to: 18 });
      assert.equal(text.slice(hit.hitStart, hit.hitEnd), text);
    });

    section('two parenthesised links on one line keep their own offsets', () => {
      const text = '[a](https://e.com/x_(1)) and [b](https://e.com/y_(2))';
      const found = findTargets(text);
      assert.deepEqual(found.map((f) => f.raw), ['https://e.com/x_(1)', 'https://e.com/y_(2)']);
      // Each link's hit area is its own whole construct, in order.
      assert.deepEqual(found.map((f) => text.slice(f.hitStart, f.hitEnd)),
        ['[a](https://e.com/x_(1))', '[b](https://e.com/y_(2))']);
    });

    section('the older, simpler shapes still parse', () => {
      assert.deepEqual(only('[a](../src/main.c#L18)').target,
        { kind: 'code', source: 'local', path: '../src/main.c', from: 18, to: 18 });
      assert.equal(only('[a](../src/main.c#L18 "title")').raw, '../src/main.c#L18',
        'a title is not part of the destination');
      assert.equal(only('[a]( https://e.com/p#h )').raw, 'https://e.com/p#h',
        'surrounding space is not part of the destination');
    });

    section('an image is not a preview target, and its text is not read as one', () => {
      assert.deepEqual(findTargets('![img](x.png)'), []);
      assert.deepEqual(findTargets('![plot](../shot.png)'), []);
      // The image link is still recognised as a link, so its own destination is reported once
      // and the `!` stays outside the hit area.
      const text = '![shot](../src/main.c#L18)';
      const hit = only(text);
      assert.equal(hit.raw, '../src/main.c#L18');
      assert.equal(hit.hitStart, 1);
    });

    section('an unclosed or empty destination is not a target', () => {
      assert.deepEqual(findTargets('[a](b'), []);
      assert.deepEqual(findTargets('[a](b(c)'), [], 'an unclosed inner paren is not a destination');
      assert.deepEqual(findTargets('[a]()'), []);
      assert.deepEqual(findTargets('[a]( )'), []);
    });
  },
};
