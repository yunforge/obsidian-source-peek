'use strict';

// Which stretch of a page a link's fragment asks for.
//
// The fragment addresses headings, and the dash says how much of the page to take around
// them:
//
//   #install          that heading and everything under it, up to the next heading of the
//                     same rank or higher
//   #-#install        the page up to that heading, not including it
//   #install-usage    from `install` up to, not including, `usage`
//   #install-          from that heading to the end of the page
//   (no fragment)     the whole page
//
// Headings are matched the way a browser matches an anchor: lower-cased, punctuation
// dropped, runs of whitespace turned into dashes. A heading may itself contain a dash —
// "Getting Started", "COVID-19" — so a range is split at whichever dash leaves two names
// that both resolve, and an exact match on the whole fragment wins over any split.

// The form a heading is compared in. Letters and numbers of any script are kept, not just
// `a-z0-9`: a page headed `安装` has an anchor of its own, and stripping it to '' made the
// fragment fall through to some other heading. Combining marks are kept too — `का` and `कि`
// are different syllables that differ only in one, so dropping them would fold the two into
// a single slug. NFC first, so a decomposed `é` (e + U+0301) compares equal to the composed one.
function slugify(input) {
  return String(input)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Whether a heading block answers to `name`. Three ways, because pages name their headings
// three ways and a link copied from the address bar uses the third:
//
//   - its id, exactly — rustdoc's `#method.new` against `<h2 id="method.new">`, whose text
//     is `pub const fn new() -> Vec<T>` and would never slug to that
//   - its text, slugged — `#getting-started` against `Getting Started`
//   - its text, ignoring case — for a heading that is all punctuation, whose slug is empty
function headingMatches(block, name) {
  if (!block || block.type !== 'h') return false;
  const wanted = String(name).trim();
  // Nothing wanted matches nothing. Without this, an empty name reached the last comparison
  // below and answered yes to a heading whose own text is empty once trimmed.
  if (!wanted) return false;

  if (block.id && block.id.toLowerCase() === wanted.toLowerCase()) return true;

  // An empty slug is not a wildcard. A name that is all punctuation kept no characters to
  // compare, so it may only match a heading whose text is that same string; it never
  // resolves to a different heading merely because both slugged to ''.
  const slug = slugify(wanted);
  if (!slug) return block.text.trim().toLowerCase() === wanted.toLowerCase();

  // The slug is compared against both the heading's text and its id: `#method.new` sludges
  // to `methodnew`, which is not the text's slug but is the id's.
  if (slugify(block.text) === slug) return true;
  if (block.id && slugify(block.id) === slug) return true;
  return block.text.trim().toLowerCase() === wanted.toLowerCase();
}

// The first heading at or after `start` that answers to `name`, or -1.
function findHeading(blocks, name, start) {
  const from = start == null ? 0 : Math.max(0, start);
  for (let i = from; i < blocks.length; i++) {
    if (headingMatches(blocks[i], name)) return i;
  }
  return -1;
}

// The index one past the end of the section a heading opens: the next heading of the same
// rank or higher, or the end of the page.
function sectionEnd(blocks, index) {
  const level = blocks[index].level || 1;
  for (let i = index + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'h' && (block.level || 1) <= level) return i;
  }
  return blocks.length;
}

// A range resolved against a page: [from, to) in block indices. `miss` names the heading
// that could not be found, or is '' when everything resolved.
function whole(blocks) {
  return { from: 0, to: blocks.length, miss: '' };
}

function miss(name) {
  return { from: 0, to: 0, miss: name };
}

// Resolve a fragment against a page's blocks.
function resolveRange(blocks, fragment) {
  const text = String(fragment == null ? '' : fragment).trim();
  if (!text) return whole(blocks);

  // Up to a heading: `-#install`.
  if (text.startsWith('-')) {
    const name = text.slice(1);
    if (!name) return whole(blocks);
    const end = findHeading(blocks, name, 0);
    // The heading IS the first block: there is nothing before it, and that is a miss — an
    // empty answer indistinguishable from success would render as a blank panel instead of
    // saying the stretch the link asked for does not exist.
    if (end <= 0) return miss(name);
    return { from: 0, to: end, miss: '' };
  }

  // From a heading to the end: `install-`.
  if (text.endsWith('-')) {
    const name = text.slice(0, -1);
    if (!name) return whole(blocks);
    const start = findHeading(blocks, name, 0);
    if (start < 0) return miss(name);
    return { from: start, to: blocks.length, miss: '' };
  }

  // A heading on its own: the fragment may itself be a heading that contains dashes, so an
  // exact match is tried before any split.
  const exact = findHeading(blocks, text, 0);
  if (exact >= 0) return { from: exact, to: sectionEnd(blocks, exact), miss: '' };

  // A range: `install-usage`. Every dash is tried, left to right, and the first split whose
  // two halves both resolve is the one meant — which is what lets `getting-started-usage`
  // come apart as `getting-started` + `usage` rather than `getting` + `started-usage`.
  for (let i = text.indexOf('-'); i !== -1; i = text.indexOf('-', i + 1)) {
    const left = text.slice(0, i);
    const right = text.slice(i + 1);
    if (!left || !right) continue;
    const from = findHeading(blocks, left, 0);
    if (from < 0) continue;
    // The second heading has to come after the first; a range runs forwards.
    const to = findHeading(blocks, right, from + 1);
    if (to < 0) continue;
    return { from, to, miss: '' };
  }

  return miss(text);
}

// The blocks a fragment asks for, plus whether anything failed to resolve.
function selectBlocks(blocks, fragment) {
  const range = resolveRange(blocks, fragment);
  if (range.miss) return { blocks: [], miss: range.miss };
  return { blocks: blocks.slice(range.from, range.to), miss: '' };
}

// headingMatches stays module-internal: findHeading is its only consumer.
// Test seam: `resolveRange`, `slugify`, `findHeading` and `sectionEnd` are consumed only by test/.
module.exports = { selectBlocks, resolveRange, slugify, findHeading, sectionEnd };
