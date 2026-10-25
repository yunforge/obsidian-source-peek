'use strict';

// parse: the text of a link -> a preview target, and every target on one line.

const assert = require('assert/strict');
const { parseTarget, parseLineFragment, findTargets } = require('../src/parse');

// Assertions are grouped so a failure names the branch it came from.
function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

module.exports = {
  name: 'parse: line fragments, targets, findTargets',
  run() {
    section('parseLineFragment', () => {
      assert.deepEqual(parseLineFragment('L18'), { from: 18, to: 18 });
      assert.deepEqual(parseLineFragment('L18-23'), { from: 18, to: 23 });
      assert.deepEqual(parseLineFragment('L18-L23'), { from: 18, to: 23 });
      assert.deepEqual(parseLineFragment('l18'), { from: 18, to: 18 }, 'case-insensitive');
      assert.deepEqual(parseLineFragment('L23-18'), { from: 18, to: 23 }, 'reversed range read forwards');
      assert.deepEqual(parseLineFragment('  L18  '), { from: 18, to: 18 }, 'surrounding space trimmed');
      assert.equal(parseLineFragment('install'), null, 'a heading slug is not a line fragment');
      assert.equal(parseLineFragment(''), null);
      assert.equal(parseLineFragment('L'), null);
      assert.equal(parseLineFragment('Labc'), null);
      assert.equal(parseLineFragment('L18-'), null);
      assert.equal(parseLineFragment(null), null);
    });

    section('parseTarget: local path with a line', () => {
      assert.deepEqual(parseTarget('../src/main.c#L18'),
        { kind: 'code', source: 'local', path: '../src/main.c', from: 18, to: 18 });
      assert.deepEqual(parseTarget('../src/main.c#L18-23'),
        { kind: 'code', source: 'local', path: '../src/main.c', from: 18, to: 23 });
      assert.deepEqual(parseTarget('../src/main.c#L18-L23'),
        { kind: 'code', source: 'local', path: '../src/main.c', from: 18, to: 23 });
      assert.deepEqual(parseTarget('docs/a.md#L5'),
        { kind: 'code', source: 'local', path: 'docs/a.md', from: 5, to: 5 });
    });

    section('parseTarget: autolink brackets stripped', () => {
      assert.deepEqual(parseTarget('<../src/main.c#L18>'),
        { kind: 'code', source: 'local', path: '../src/main.c', from: 18, to: 18 });
      assert.deepEqual(parseTarget('<https://example.com/page#install>'),
        { kind: 'web', url: 'https://example.com/page', heading: 'install' });
    });

    section('parseTarget: not a target', () => {
      assert.equal(parseTarget('../src/main.c'), null, 'a local path needs its #L');
      assert.equal(parseTarget(''), null);
      assert.equal(parseTarget('   '), null);
      assert.equal(parseTarget('#L18'), null, 'a fragment with no path');
      assert.equal(parseTarget(null), null);
      assert.equal(parseTarget(42), null, 'non-string input');
    });

    section('parseTarget: github blob', () => {
      assert.deepEqual(parseTarget('https://github.com/o/r/blob/main/src/main.c#L18-L23'), {
        kind: 'code',
        source: 'remote',
        rawUrl: 'https://raw.githubusercontent.com/o/r/main/src/main.c',
        host: 'github',
        path: 'src/main.c',
        from: 18,
        to: 23,
      });
    });

    section('parseTarget: gitlab blob', () => {
      assert.deepEqual(parseTarget('https://gitlab.com/g/p/-/blob/main/src/main.c#L18-23'), {
        kind: 'code',
        source: 'remote',
        rawUrl: 'https://gitlab.com/g/p/-/raw/main/src/main.c',
        host: 'gitlab',
        path: 'src/main.c',
        from: 18,
        to: 23,
      });
    });

    section('parseTarget: a blob we cannot read degrades to a web page', () => {
      assert.deepEqual(parseTarget('https://github.com/o/r/blob/main/src/main.c'),
        { kind: 'web', url: 'https://github.com/o/r/blob/main/src/main.c', heading: '' });
      assert.deepEqual(parseTarget('https://bitbucket.org/o/r/src/main.c#L18'),
        { kind: 'web', url: 'https://bitbucket.org/o/r/src/main.c', heading: 'L18' });
    });

    section('parseTarget: ordinary web page', () => {
      assert.deepEqual(parseTarget('https://example.com/page#install'),
        { kind: 'web', url: 'https://example.com/page', heading: 'install' });
      assert.deepEqual(parseTarget('https://example.com/page'),
        { kind: 'web', url: 'https://example.com/page', heading: '' });
      assert.deepEqual(parseTarget('https://example.com/page#install%20guide'),
        { kind: 'web', url: 'https://example.com/page', heading: 'install guide' });
      assert.deepEqual(parseTarget('https://example.com/page#%E4%B8%AD%E6%96%87'),
        { kind: 'web', url: 'https://example.com/page', heading: '\u4e2d\u6587' });
    });

    section('parseTarget: an undecodable fragment keeps its raw text', () => {
      assert.deepEqual(parseTarget('https://example.com/page#%E9%9D'),
        { kind: 'web', url: 'https://example.com/page', heading: '%E9%9D' });
      assert.deepEqual(parseTarget('https://example.com/page#%'),
        { kind: 'web', url: 'https://example.com/page', heading: '%' });
    });

    section('findTargets: a markdown link is reported once, with no overlapping noise', () => {
      const text = 'see [text](../src/main.c#L18) here';
      const found = findTargets(text);
      assert.equal(found.length, 1);
      assert.equal(found[0].raw, '../src/main.c#L18');
      assert.deepEqual(found[0].target,
        { kind: 'code', source: 'local', path: '../src/main.c', from: 18, to: 18 });
      assert.ok(text.slice(found[0].hitStart, found[0].hitEnd).includes(found[0].raw),
        'the destination sits inside the hoverable span');
      assert.equal('start' in found[0], false,
        'destination offsets are not reported — hitStart/hitEnd are the contract');
    });

    section('findTargets: the pointer may rest anywhere on the link, text included', () => {
      // The target is the destination, but the reader points at the words. Reporting only
      // the destination made the preview fire at the tail of the link and nowhere else.
      const text = '[the parser](../src/main.c#L18)';
      const found = findTargets(text);
      assert.equal(found.length, 1);
      const hit = found[0];
      assert.equal(text.slice(hit.hitStart, hit.hitEnd), text, 'the whole link is the hit area');
      assert.ok(text.slice(hit.hitStart, hit.hitEnd).includes('../src/main.c#L18'), 'the destination rides inside it');

      // Every column of the visible text must count, not only the destination.
      for (let col = 0; col <= text.length; col++) {
        const on = col >= hit.hitStart && col <= hit.hitEnd;
        assert.ok(on, 'column ' + col + ' of the link must preview it');
      }
    });

    section('findTargets: an autolink is hoverable across its whole span', () => {
      const text = 'see <../src/main.c#L18> now';
      const found = findTargets(text);
      assert.equal(found.length, 1);
      const hit = found[0];
      assert.equal(text.slice(hit.hitStart, hit.hitEnd), '<../src/main.c#L18>');
      assert.ok(text.slice(hit.hitStart, hit.hitEnd).includes('../src/main.c#L18'));
    });

    section('findTargets: an autolink is reported once', () => {
      const text = 'goto <../src/main.c#L18> now';
      const found = findTargets(text);
      assert.equal(found.length, 1);
      assert.equal(found[0].raw, '../src/main.c#L18');
      assert.equal(text.slice(found[0].hitStart, found[0].hitEnd), '<../src/main.c#L18>');
    });

    section('findTargets: a bare remote URL', () => {
      const text = 'read https://github.com/o/r/blob/main/a.c#L3 ok';
      const found = findTargets(text);
      assert.equal(found.length, 1);
      assert.equal(found[0].raw, 'https://github.com/o/r/blob/main/a.c#L3');
      assert.equal(found[0].target.host, 'github');
      assert.equal(found[0].target.from, 3);
      assert.equal(text.slice(found[0].hitStart, found[0].hitEnd), found[0].raw);
    });

    section('findTargets: several targets, exact ascending offsets', () => {
      const text = 'a ../x.c#L1 b https://example.com/p#h c';
      const found = findTargets(text);
      assert.equal(found.length, 2);
      assert.deepEqual(found.map((f) => f.raw), ['../x.c#L1', 'https://example.com/p#h']);
      for (const f of found) assert.equal(text.slice(f.hitStart, f.hitEnd), f.raw, 'a bare target is exactly its hit area');
      assert.ok(found[0].hitStart < found[1].hitStart, 'sorted by hit start');
    });

    section('findTargets: the same target written twice keeps both offsets', () => {
      const text = '[a](../x.c#L1) and ../x.c#L1 again';
      const found = findTargets(text);
      assert.equal(found.length, 2, 'two occurrences, two entries');
      assert.deepEqual(found.map((f) => f.hitStart), [0, 19]);
      assert.ok(text.slice(found[0].hitStart, found[0].hitEnd).includes(found[0].raw));
      assert.equal(text.slice(found[1].hitStart, found[1].hitEnd), found[1].raw);
    });

    section('findTargets: text with nothing to preview', () => {
      assert.deepEqual(findTargets('plain words only'), []);
      assert.deepEqual(findTargets(''), []);
      assert.deepEqual(findTargets(null), []);
    });

    section('findTargets: prose punctuation is not part of a bare target', () => {
      const text = 'see https://example.com/p#h.';
      const found = findTargets(text);
      assert.equal(found.length, 1);
      assert.equal(found[0].raw, 'https://example.com/p#h', 'trailing full stop dropped');
      assert.equal(text.slice(found[0].hitStart, found[0].hitEnd), found[0].raw);
    });
  },
};
