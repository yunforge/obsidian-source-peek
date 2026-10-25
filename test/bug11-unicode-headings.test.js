'use strict';

// bug11: a heading in a script other than Latin did not resolve to itself.
//
// `slugify` kept only `[a-z0-9]`, so a heading with no ASCII in it kept nothing at all:
// `安装` slugged to '' and `安装-usage` slugged to 'usage', which quietly answered with the
// Usage section — a different section, reported as a hit, with no miss to warn anyone.
//
// Keeping Unicode letters is only half of it. Devanagari `का` and `कि` are two different
// syllables that differ only in their combining mark, so a slug that drops marks (Mn/Mc/Me)
// folds them into the same string and turns "not found" into "found the wrong heading".
// Anything that slugs to '' must not act as a wildcard either.

const assert = require('assert/strict');
const { selectBlocks, slugify, findHeading } = require('../src/sections');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

const page = (spec) => spec.map(([type, text, level]) => {
  const b = { type, text };
  if (level) b.level = level;
  return b;
});

const texts = (r) => r.blocks.map((b) => b.text);

// `安装` then `Usage`: the case from the report, where `安装-usage` must run from the
// Chinese heading up to the English one instead of starting at `Usage`.
const CJK_DOC = page([
  ['h', '安装', 2],
  ['p', '安装正文'],
  ['h', 'Usage', 2],
  ['p', 'then use it'],
]);

// Two Devanagari headings whose slugs differ only by a combining mark.
const DEV_DOC = page([
  ['h', 'का', 2],
  ['p', 'first'],
  ['h', 'कि', 2],
  ['p', 'second'],
]);

module.exports = {
  name: 'bug11: headings in any script resolve to themselves, and an empty slug matches nothing',
  run() {
    section('slugify keeps letters of every script', () => {
      assert.equal(slugify('安装'), '安装');
      assert.equal(slugify('インストール'), 'インストール');
      assert.equal(slugify('установка'), 'установка');
      // The ASCII behaviour is untouched.
      assert.equal(slugify('Getting Started'), 'getting-started');
      assert.equal(slugify('Install & Setup'), 'install-setup');
    });

    section('slugify keeps combining marks, so Devanagari syllables stay apart', () => {
      assert.notEqual(slugify('का'), slugify('कि'),
        'का and कि differ only in their combining mark; both slugged to the same string');
      assert.equal(slugify('का'), 'का');
      assert.equal(slugify('कि'), 'कि');
    });

    section('slugify compares composed and decomposed text alike', () => {
      // 'é' as one code point vs 'e' + U+0301: the same heading, however the page spells it.
      assert.equal(slugify('Caf\u00e9'), slugify('Cafe\u0301'));
    });

    section('a Chinese heading is found under its own name', () => {
      assert.deepEqual(texts(selectBlocks(CJK_DOC, '安装')), ['安装', '安装正文']);
    });

    section('a range starting at a Chinese heading does not fall through to a Latin one', () => {
      // Before the fix '安装-usage' slugged the left half to '' and the whole fragment to
      // 'usage', so this returned the Usage section with miss:''.
      const r = selectBlocks(CJK_DOC, '安装-usage');
      assert.equal(r.miss, '', 'the range resolves');
      assert.deepEqual(texts(r), ['安装', '安装正文'], 'starts at 安装, stops before Usage');
    });

    section('Japanese and Cyrillic headings resolve', () => {
      const doc = page([
        ['h', 'インストール', 2],
        ['p', 'jp body'],
        ['h', 'установка', 2],
        ['p', 'ru body'],
        ['h', 'Other', 2],
      ]);
      assert.deepEqual(texts(selectBlocks(doc, 'インストール')), ['インストール', 'jp body']);
      assert.deepEqual(texts(selectBlocks(doc, 'установка')), ['установка', 'ru body']);
      // Case folding still applies to non-Latin scripts.
      assert.deepEqual(texts(selectBlocks(doc, 'УСТАНОВКА')), ['установка', 'ru body']);
    });

    section('two Devanagari headings are told apart', () => {
      // findHeading already answered this correctly before the fix: both names slugged to
      // '' and the fallback compared the text exactly. The fix must not lose that.
      assert.equal(findHeading(DEV_DOC, 'कि', 0), 2, "कि is the second heading, not the first");
      assert.equal(findHeading(DEV_DOC, 'का', 0), 0);
      assert.deepEqual(texts(selectBlocks(DEV_DOC, 'कि')), ['कि', 'second']);
    });

    section('a heading that is not on the page is a miss, not another section', () => {
      const r = selectBlocks(CJK_DOC, '不存在的标题');
      assert.equal(r.miss, '不存在的标题', 'the fragment that failed is reported');
      assert.deepEqual(r.blocks, [], 'nothing is drawn');
      assert.equal(selectBlocks(CJK_DOC, 'インストール').miss, 'インストール',
        'a heading from another script is not found either');
    });

    section('an empty slug is not a wildcard', () => {
      // A heading whose text is all punctuation slugs to ''; a fragment that also slugs to
      // '' must not address it, because the two have nothing in common but their emptiness.
      const doc = page([
        ['h', '!!!', 2],
        ['p', 'punctuation heading'],
        ['h', 'Other', 2],
        ['p', 'body'],
      ]);
      assert.equal(slugify('???'), '');
      assert.equal(selectBlocks(doc, '???').miss, '???', 'an empty slug does not match a heading');
      assert.equal(selectBlocks(doc, '...').miss, '...');
      // The very same text still addresses it, compared character for character.
      assert.deepEqual(texts(selectBlocks(doc, '!!!')), ['!!!', 'punctuation heading']);
    });

    section('an empty name matches no heading at all', () => {
      // The last-resort comparison in headingMatches is text equality; with an empty name it
      // would have answered yes to a heading whose text is empty too.
      const doc = page([
        ['h', '', 2],
        ['p', 'an untitled heading'],
        ['h', 'Other', 2],
      ]);
      assert.equal(findHeading(doc, '', 0), -1, 'an empty name names nothing');
      assert.equal(selectBlocks(doc, 'Other').miss, '', 'a real name still resolves beside it');
    });
  },
};
