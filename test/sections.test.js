'use strict';

// sections: which stretch of a page a fragment asks for.
//
// The fragment addresses headings and the dash says how much to take around them. These are
// the five forms, and each has to mean exactly one thing — a range that quietly resolves to
// the whole page would look like success while showing the wrong thing.

const assert = require('assert/strict');
const { selectBlocks, resolveRange, slugify, findHeading, sectionEnd } = require('../src/sections');

// A page with nested headings, so section ends can be checked.
const page = (spec) => spec.map(([type, text, level]) => {
  const b = { type, text };
  if (level) b.level = level;
  return b;
});

const DOC = page([
  ['h', 'Guide', 1],        // 0
  ['p', 'intro', 0],        // 1
  ['h', 'Install', 2],      // 2
  ['p', 'run npm i', 0],    // 3
  ['h', 'Advanced', 3],     // 4
  ['p', 'flags', 0],        // 5
  ['h', 'Usage', 2],        // 6
  ['p', 'then use it', 0],  // 7
  ['h', 'Appendix', 2],     // 8
  ['p', 'extra', 0],        // 9
]);

const texts = (r) => r.blocks.map((b) => b.text);

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'sections: heading, range, and edge-of-page fragments',
  run() {
    section('no fragment means the whole page', () => {
      assert.deepEqual(texts(selectBlocks(DOC, '')), DOC.map((b) => b.text));
      assert.deepEqual(texts(selectBlocks(DOC, null)), DOC.map((b) => b.text));
      assert.deepEqual(texts(selectBlocks(DOC, undefined)), DOC.map((b) => b.text));
    });

    section('#heading — that section, nested headings included', () => {
      // Stops at the next heading of the same rank or higher: `Advanced` is a child, so it
      // stays; `Usage` is a sibling, so it ends the section.
      assert.deepEqual(texts(selectBlocks(DOC, 'install')),
        ['Install', 'run npm i', 'Advanced', 'flags']);
    });

    section('#-#heading — from the top up to, not including, that heading', () => {
      assert.deepEqual(texts(selectBlocks(DOC, '-install')),
        ['Guide', 'intro'], 'stops just before the named heading');
      assert.deepEqual(texts(selectBlocks(DOC, '-usage')),
        ['Guide', 'intro', 'Install', 'run npm i', 'Advanced', 'flags']);
      assert.deepEqual(texts(selectBlocks(DOC, '-guide')), [],
        'the very first heading leaves nothing above it');
    });

    section('#heading1-heading2 — from one heading up to, not including, the next', () => {
      assert.deepEqual(texts(selectBlocks(DOC, 'install-usage')),
        ['Install', 'run npm i', 'Advanced', 'flags'], 'includes the first, excludes the second');
      assert.deepEqual(texts(selectBlocks(DOC, 'usage-appendix')),
        ['Usage', 'then use it']);
      assert.deepEqual(texts(selectBlocks(DOC, 'guide-appendix')),
        ['Guide', 'intro', 'Install', 'run npm i', 'Advanced', 'flags', 'Usage', 'then use it']);
    });

    section('#heading- — from that heading to the end', () => {
      assert.deepEqual(texts(selectBlocks(DOC, 'usage-')),
        ['Usage', 'then use it', 'Appendix', 'extra']);
      assert.deepEqual(texts(selectBlocks(DOC, 'install-')),
        ['Install', 'run npm i', 'Advanced', 'flags', 'Usage', 'then use it', 'Appendix', 'extra']);
    });

    section('a range runs forwards only', () => {
      // `usage-install` names a heading after the one it starts from. There is no forward
      // range between them, so it does not resolve.
      assert.equal(selectBlocks(DOC, 'usage-install').miss, 'usage-install');
    });

    section('a heading that is not on the page is reported', () => {
      const r = selectBlocks(DOC, 'nope');
      assert.equal(r.miss, 'nope');
      assert.deepEqual(r.blocks, [], 'nothing is drawn');
      assert.equal(selectBlocks(DOC, '-nope').miss, 'nope');
      assert.equal(selectBlocks(DOC, 'nope-').miss, 'nope');
      assert.equal(selectBlocks(DOC, 'nope-usage').miss, 'nope-usage');
      assert.equal(selectBlocks(DOC, 'install-nope').miss, 'install-nope');
    });

    section('heading matching ignores case, punctuation and spacing', () => {
      assert.deepEqual(texts(selectBlocks(DOC, 'INSTALL')), ['Install', 'run npm i', 'Advanced', 'flags']);
      assert.deepEqual(texts(selectBlocks(DOC, 'Install')), ['Install', 'run npm i', 'Advanced', 'flags']);
    });

    section('a heading answers to its id as well as its text', () => {
      // rustdoc puts the anchor on a `<section>` wrapping the heading, and the heading's own
      // text would never slug to the id: `#method.new` against
      // `<section id="method.new"><h4>pub const fn new() -> Vec<T>`.
      const doc = [
        { type: 'h', level: 4, text: 'pub const fn new() -> Vec<T>', id: 'method.new' },
        { type: 'p', text: 'body' },
        { type: 'h', level: 4, text: 'pub fn with_capacity(capacity: usize) -> Vec<T>', id: 'method.with_capacity' },
        { type: 'p', text: 'more' },
      ];
      assert.deepEqual(texts(selectBlocks(doc, 'method.new')), ['pub const fn new() -> Vec<T>', 'body'],
        'the id addresses the heading');
      assert.deepEqual(texts(selectBlocks(doc, 'method.with_capacity')),
        ['pub fn with_capacity(capacity: usize) -> Vec<T>', 'more']);
      // The id's own slug works too: `method.new` slugs to `methodnew`.
      assert.deepEqual(texts(selectBlocks(doc, 'methodnew')),
        ['pub const fn new() -> Vec<T>', 'body'], "the id's slug resolves");
      // A dash is a range separator, so `method-new` is not this heading — it is a range
      // whose two halves (`method`, `new`) do not both name headings.
      assert.equal(selectBlocks(doc, 'method-new').miss, 'method-new');
    });

    section('an id with dots is not mistaken for a range', () => {
      const doc = [
        { type: 'h', level: 4, text: 'one', id: 'method.a' },
        { type: 'p', text: 'x' },
        { type: 'h', level: 4, text: 'two', id: 'method.b' },
      ];
      // No dash, so no range; it is one heading addressed by id.
      assert.deepEqual(texts(selectBlocks(doc, 'method.a')), ['one', 'x']);
    });

    section('a heading whose own name contains a dash', () => {
      // `getting-started` must be found as one heading, not split into `getting` + `started`.
      const doc = page([
        ['h', 'Docs', 1],
        ['h', 'Getting Started', 2],
        ['p', 'body'],
        ['h', 'Usage', 2],
        ['p', 'use'],
      ]);
      assert.deepEqual(texts(selectBlocks(doc, 'getting-started')),
        ['Getting Started', 'body'], 'an exact match wins over any split');
      assert.deepEqual(texts(selectBlocks(doc, 'getting-started-usage')),
        ['Getting Started', 'body'], 'and still splits when the whole string does not resolve');
    });

    section('a heading with a dash in a range, resolved by trying each split', () => {
      const doc = page([
        ['h', 'Getting Started', 2],
        ['p', 'a'],
        ['h', 'Next Steps', 2],
        ['p', 'b'],
      ]);
      // `getting-started-next-steps`: several dashes, only one split resolves both halves.
      assert.deepEqual(texts(selectBlocks(doc, 'getting-started-next-steps')), ['Getting Started', 'a']);
    });

    section('the same heading twice resolves to the first', () => {
      const doc = page([
        ['h', 'A', 1], ['p', 'one'],
        ['h', 'B', 2], ['p', 'two'],
        ['h', 'A', 1], ['p', 'three'],
      ]);
      assert.deepEqual(texts(selectBlocks(doc, 'a')), ['A', 'one', 'B', 'two'],
        'the first A, up to the second');
    });

    section('sectionEnd respects nesting', () => {
      assert.equal(sectionEnd(DOC, 2), 6, 'Install ends where Usage begins');
      assert.equal(sectionEnd(DOC, 4), 6, 'Advanced (h3) also ends at Usage (h2)');
      assert.equal(sectionEnd(DOC, 8), DOC.length, 'the last section runs to the end');
    });

    section('findHeading searches from an offset', () => {
      assert.equal(findHeading(DOC, 'usage', 0), 6);
      assert.equal(findHeading(DOC, 'usage', 7), -1, 'past it, there is none');
      assert.equal(findHeading(DOC, 'nope', 0), -1);
    });

    section('slugify', () => {
      assert.equal(slugify('Getting Started'), 'getting-started');
      assert.equal(slugify('Install & Setup'), 'install-setup');
      assert.equal(slugify('  Spaces  '), 'spaces');
      assert.equal(slugify('!!'), '');
      assert.equal(slugify('COVID-19'), 'covid-19');
    });

    section('resolveRange reports indices, not blocks', () => {
      assert.deepEqual(resolveRange(DOC, 'install'), { from: 2, to: 6, miss: '' });
      assert.deepEqual(resolveRange(DOC, '-install'), { from: 0, to: 2, miss: '' });
      assert.deepEqual(resolveRange(DOC, 'usage-'), { from: 6, to: DOC.length, miss: '' });
      assert.deepEqual(resolveRange(DOC, ''), { from: 0, to: DOC.length, miss: '' });
    });

    section('a page with no headings still answers the whole-page case', () => {
      const doc = page([['p', 'only text']]);
      assert.deepEqual(texts(selectBlocks(doc, '')), ['only text']);
      assert.equal(selectBlocks(doc, 'anything').miss, 'anything');
    });

    section('a dangling dash is not a heading name', () => {
      // `-` alone has neither side; it is treated as no fragment rather than as a miss.
      assert.deepEqual(texts(selectBlocks(DOC, '-')), DOC.map((b) => b.text));
    });
  },
};
