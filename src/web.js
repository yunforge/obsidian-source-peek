'use strict';

// Reading a web page as something a preview can show.
//
// A page is a document, not a file: what the reader wants from it is its shape — the
// headings, the paragraphs, the code — and only sometimes all of it. When the link names
// a heading (`https://example.com/page#install`), the preview narrows to that heading's
// stretch of the page and stops at the next heading of the same rank or higher.
//
// `extract` is pure: it takes HTML and gives back blocks. `fetchSection` is the network
// half, kept separate so the parsing can be tested without a page to fetch.

const { selectBlocks } = require('./sections');

// A page is drawn in full, but not without a ceiling: a pathological document could hand the
// renderer tens of thousands of blocks and freeze the editor. This is a guard, not a setting
// — high enough that no real documentation page reaches it.
const BLOCK_CEILING = 2000;

// The named entities that actually turn up in prose. Anything else is left verbatim
// rather than guessed at.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ensp: ' ', emsp: ' ', thinsp: ' ', copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
  hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', middot: '\u00b7',
  laquo: '\u00ab', raquo: '\u00bb', times: '\u00d7', divide: '\u00f7', deg: '\u00b0',
  plusmn: '\u00b1', frac12: '\u00bd', bull: '\u2022', ldquo: '\u201c', rdquo: '\u201d',
  lsquo: '\u2018', rsquo: '\u2019', sect: '\u00a7', para: '\u00b6',
  euro: '\u20ac', pound: '\u00a3', yen: '\u00a5', cent: '\u00a2',
};

const EMITTING_TAGS = { p: 'p', li: 'li', blockquote: 'quote' };
const HEADING_TAG = /^h([1-6])$/;

// Which start tags end an element that is still open, for the elements HTML closes implicitly
// that the block stack does not cover: <p>, <li> and the headings are handled by `impliedClose`
// on its own, because those do become blocks. <dt>, <dd>, <option> and <optgroup> never do
// (they are not in `EMITTING_TAGS`), so they never sit on the block stack and the only place
// their implied close matters is the container stack. Keyed by the tag that starts.
//
// The list is not symmetric for the option group, because the two directions differ: an
// <option> is ended by the next <option> and by an <optgroup> that starts, while an <optgroup>
// is ended only by the next <optgroup> — an <option> inside it is the group's content, so
// closing the group there would drop the id that a heading inside the group should inherit.
const IMPLIED_CLOSE = new Map([
  ['li', { ends: ['li'], scope: ['ul', 'ol', 'menu'] }],
  ['dt', { ends: ['dt', 'dd'], scope: ['dl'] }],
  ['dd', { ends: ['dt', 'dd'], scope: ['dl'] }],
  ['option', { ends: ['option'], scope: ['select', 'datalist', 'optgroup'] }],
  ['optgroup', { ends: ['option', 'optgroup'], scope: ['select', 'datalist'] }],
  ['tr', { ends: ['tr', 'td', 'th'], scope: ['table', 'thead', 'tbody', 'tfoot'] }],
  ['td', { ends: ['td', 'th'], scope: ['tr', 'table'] }],
  ['th', { ends: ['td', 'th'], scope: ['tr', 'table'] }],
]);

// A block-level element cannot live inside a <p>, so the paragraph ends where it begins.
const BLOCK_LEVEL = new Set(('address article aside blockquote caption details dialog div dl dd dt '
  + 'fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main menu nav ol '
  + 'p pre search section summary table tbody td tfoot th thead tr ul').split(' '));

// Only inline content may sit between an open <p> and the block that ends it; anything else
// means the paragraph was already over.
const INLINE_LEVEL = new Set(('a abbr b bdi bdo br cite code data del dfn em i ins kbd label mark '
  + 'q s samp small span strong sub sup time u var wbr').split(' '));

// The elements HTML gives no closing tag. A page writes `<hr id="sep">` far more often than
// `<hr id="sep" />`, and neither form ever sees a `</hr>`, so neither may be remembered as an
// open container: the id would stay on the stack for the rest of the page and every heading
// after it — none of which is inside the `<hr>` — would inherit it.
const VOID_TAGS = new Set(('area base br col embed hr img input link meta param source track wbr '
  // Obsolete but still written by old CMS exports: HTML treats these as void too.
  + 'basefont bgsound frame isindex keygen').split(' '));

// Elements that lay out as blocks. Their edges are where one run of prose stops and the next
// begins, so text on either side of one has to be separated: <div>hello</div><div>world</div>
// is two words, not "helloworld". Inline elements (<b>, <span>, <em>) are the opposite case —
// they sit *inside* a word — and must never introduce a break.
const BLOCK_TAGS = new Set(('address article aside blockquote details dialog div dl dd dt fieldset '
  + 'figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section '
  + 'summary table tbody td tfoot th thead tr ul caption colgroup menu search option optgroup select '
  + 'legend center dir').split(' '));

// Characters that attach to the word before them rather than starting a new one. A block edge
// before one of these is not a word boundary, so no space belongs there.
const CLOSING_PUNCT = /^[,.;:!?%)\]}》」』、，。；：！？）】]/;

// --- text helpers ---------------------------------------------------------

function decodeEntities(input) {
  return String(input).replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body.charAt(0) === '#') {
      const hex = body.charAt(1) === 'x' || body.charAt(1) === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try { return String.fromCodePoint(code); } catch (err) { return match; }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

function stripTags(input) { return String(input).replace(/<[^>]*>/g, ''); }

// The names HTML actually gives a meaning to, plus the custom-element convention (a hyphen).
// A `<>` holding one of these is markup a highlighter wrapped the code in; a `<>` holding
// anything else is the code itself — `vector<int>`, `List<String>`, `map<K, V>`. This is a
// list of *element* names rather than of *formatting* names because a `<pre>` in the wild is
// wrapped in `<div class="line">`, `<div class="token-line">`, `<x-code>` just as often as in
// `<span>`, and those wrappers are markup every bit as much as `<span>` is.
//
// The list is the whole element table, deprecated and obsolete elements included: a page
// exported by Word or an old CMS writes `<font face="Courier">`, `<center>`, `<tt>`, and a
// list of only the elements one thinks of as "formatting" leaks those into the code block.
// MathML's presentation elements are here for the same reason — a `<math>` block arrives
// wrapped in `<mrow>`, `<mi>`, `<mo>`. Names are lowercase; matching is case-insensitive.
const HTML_TAGS = new Set(('a abbr acronym address applet area article aside audio b base basefont bdi bdo '
  + 'bgsound big blink blockquote body br button canvas caption center cite code col colgroup command content '
  + 'data datalist dd del details dfn dialog dir div dl dt element em embed fieldset figcaption figure font '
  + 'footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe image img input ins '
  + 'isindex kbd keygen label legend li link listing main map mark marquee menu menuitem meta meter '
  + 'multicol nav nextid nobr noembed noframes noscript object ol optgroup option output p param picture '
  + 'plaintext pre progress q rb rp rt rtc ruby s samp script search section select shadow slot small source '
  + 'spacer span strike strong style sub summary sup svg table tbody td template textarea tfoot th thead '
  + 'time title tr track tt u ul var video wbr xmp '
  // MathML: an inline formula arrives as <math><mrow><mi>x</mi><mo>&lt;</mo>…</mrow></math>, and
  // every one of those is markup. Kept separate from the HTML run only so the list stays legible.
  + 'math mrow mfrac msqrt mroot mstyle merror mpadded mphantom mtable mtr mtd mlabeledtr '
  + 'menclose mspace munder mover munderover mmultiscripts mprescripts none maction semantics annotation '
  + 'mi mn mo ms mtext '
  + 'path circle ellipse rect g line polygon polyline text tspan defs use symbol marker pattern mask '
  + 'clippath foreignobject lineargradient radialgradient stop').split(' '));

// Whether a `<>` whose name is `name` is markup rather than text. HTML tag names are
// case-insensitive — the parser around this one lowercases them too — so `<B>` is `<b>` and
// `<p>` is `<p>`, and the element table alone decides. A single capitalised letter that is
// not an element (`<T>`) is a type parameter and stays in the code.
function isMarkupName(name) {
  const lower = name.toLowerCase();
  return HTML_TAGS.has(lower) || lower.indexOf('-') >= 0;
}

// Scan the tag that starts at `text[i] === '<'`. Returns `end` (one past its `>`), `name`
// (as written), whether it closes, and `rest` — everything between the end of the name and the
// `>`, which is what tells a tag from a comparison (see opensMarkup). Null when this is not a
// completed tag: a `<` followed by a space or a digit, or an unterminated `<`. Attribute values
// are skipped with their quotes, so a `>` inside one does not end the tag and the attribute
// syntax — `@click`, `[ngClass]`, `v-if`, `:href` — never has to be understood at all.
function scanTag(text, i) {
  let k = i + 1;
  const closing = text[k] === '/';
  if (closing) k++;
  const start = k;
  while (k < text.length && /[A-Za-z0-9-]/.test(text[k])) k++;
  const name = text.slice(start, k);
  if (!name) return null;
  // What follows the name decides what this `<` really is. A code comparison writes a
  // character no tag allows there: `a<b;`, `i<n,`, `f(a<b)`, `k<m)`, `a<<b`. A name that is
  // followed by one of those is the code's own angle bracket, so only the `<` itself is text
  // and the scan resumes right after it.
  //
  // The other malformed shape is a tag cut off mid-name — `<span<i>` — where the character
  // after the name is another `<`. That one is a broken tag, not a comparison: the page meant
  // an element and the rest of the tag is lost, which is what the discard path below handles.
  if (!isTagBoundary(text[k]) && text[k] !== '>' && text[k] !== '/') {
    return text[k] === '<' ? null : { end: i + 1, notATag: true };
  }
  while (k < text.length && text[k] !== '>') {
    const ch = text[k];
    if (ch === '"' || ch === "'") {
      const close = text.indexOf(ch, k + 1);
      if (close === -1) return null;
      k = close + 1;
      continue;
    }
    k++;
  }
  if (k >= text.length) return null;
  return { end: k + 1, name, closing, rest: text.slice(start + name.length, k) };
}

// Whether the `<` at `text[i]` opens something tag-shaped (`</`, `<div`, `<span`) rather than
// a comparison (`< y`, `<3`, `a<<b`).
function opensTag(text, i) {
  return i + 1 < text.length && (text[i + 1] === '/' || /[A-Za-z]/.test(text[i + 1]));
}

// What may follow a name that is really a tag: nothing at all (`<b>`), or a whitespace
// (`<div class=...>`). Everything else is the code's own `>` of a comparison: `a<b;`,
// `i<n,`, `f(a<b)`, `k<m)`, `x<y=`, `a<<b`. The rule is a whitelist, not a blacklist: a
// character added to a language tomorrow must not silently be read as a tag boundary.
//
// This is what `isMarkupName` cannot do alone — `a<b`, `i<n`, `f(a<b)` and `a<<b` use real
// element names (`b`, `i`) for their variables, so the table calls them markup.
function isTagBoundary(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '/';
}

// Whether the page wrote a `<name …>` as a tag rather than as the code's own angle bracket.
//
// A name the element table knows is markup when a tag boundary follows it; a name it does not
// know (`<T>`, `<String>`) is markup only when it is written the way a tag is — with a space
// after the name or a trailing slash before the `>`. The second half keeps `<x-foo>` in while
// `List<String>` stays out, and the first half keeps `a<b` out while `<b>` stays in.
function opensMarkup(tag) {
  const rest = tag.rest;
  if (rest.length === 0) return isMarkupName(tag.name);
  if (!isTagBoundary(rest[0])) return false;
  return true;
}

// Whether the code has a wrapper of its own left to close. A closing tag counts as markup only
// while one does: `</span>` after the `<span>` that opened it is markup, but a `</pre>` left in
// the middle of a block — or any closer the page never opened — is text the block is showing.
function closesWrapper(tag, open) {
  return open > 0 && tag !== null && tag.closing && isMarkupName(tag.name);
}

// Where a `<!…>`, `<?…?>` or other declaration ends. Comments and doctypes are markup and go;
// a CDATA section's body is the code the page was showing, so it is kept (see codeText).
function scanDeclaration(text, i) {
  if (text.startsWith('<!--', i)) {
    const close = text.indexOf('-->', i + 4);
    return close === -1 ? text.length : close + 3;
  }
  if (text.startsWith('<![CDATA[', i)) {
    const close = text.indexOf(']]>', i + 9);
    // A CDATA section that never closes still holds code; keep the rest of the block.
    return { cdata: true, from: i + 9, end: close === -1 ? text.length : close };
  }
  if (text.startsWith('<?', i)) {
    const close = text.indexOf('?>', i + 2);
    return close === -1 ? text.length : close + 2;
  }
  const close = text.indexOf('>', i + 2);
  return close === -1 ? text.length : close + 1;
}

// A code block's text: the markup a highlighter wrapped it in is dropped, its characters are
// kept. Entities are decoded *after* the scan, because a page explaining markup writes
// `&lt;span&gt;` and that is the text the reader came for, not a tag.
//
// Deciding what is markup is the whole job, and the rule is the element table: a `<` whose name
// is an element name is markup; a `<` whose name is not (`int`, `T`, `String`, `K`) is code.
// That covers `vector<int>`, `List<String>` and `<T>` without a rule for "looks like a type",
// and it agrees with the parser around this one, which lowercases tag names too.
//
// One count carries the context a single tag cannot: `opened` is the wrappers dropped and still
// owed a closer, and a closer with none owed is text the block is showing.
function codeText(inner) {
  // `<br>` is the one element that means a line break in a code block; everything else is a
  // wrapper. It becomes a newline before the scan so the scan only sees real tags, and it is
  // matched by shape so `<br/>`, `<br />` and `<BR>` all count.
  const source = String(inner).replace(/<br\b[^<>]*>/gi, '\n');
  // Collected as pieces rather than one growing string: a highlighted line closes a wrapper per
  // line, and reassigning a longer and longer `out` each time made a long block quadratic.
  const parts = [];
  let piece = '';
  let opened = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch !== '<') { piece += ch; i++; continue; }

    if (source.startsWith('<!', i) || source.startsWith('<?', i)) {
      const decl = scanDeclaration(source, i);
      if (typeof decl === 'number') { i = decl; continue; }
      // CDATA: its body is the code being shown, so it is copied out verbatim and resumed
      // after the `]]>` that closes it (or at its end, when nothing does).
      piece += source.slice(decl.from, decl.end);
      i = decl.end >= source.length ? decl.end : decl.end + 3;
      continue;
    }
    if (!opensTag(source, i)) { piece += ch; i++; continue; }

    const tag = scanTag(source, i);
    if (tag !== null && tag.notATag) {
      // The name after this `<` cannot be a tag name — `a<b)`, `a<<b`, `f(a<b)`. The `<` is
      // the code's own character, so copy it through and carry on at the next one; treating it
      // like an unclosed tag would eat everything up to the next `>`, which is a different line.
      piece += ch;
      i++;
      continue;
    }
    if (tag === null) {
      // A tag that never closes — a broken quote (`<div class="x>…`), a page cut off
      // mid-element. Discard it up to the next `>`, which is the point the page itself would
      // have resumed: `<span<i>` leaves `i>` to be shown.
      //
      // When there is no `>` left at all the page is truncated, and the `<` is not markup the
      // reader can be told to skip: a block ending in `<span class=` is a block whose last line
      // is still code. Discarding to the end of the block would empty it, so the `<` is copied
      // through and the scan resumes one character on.
      const gt = source.indexOf('>', i);
      if (gt === -1) { piece += ch; i++; continue; }
      i = gt + 1;
      continue;
    }

    if (tag.closing) {
      if (closesWrapper(tag, opened)) {
        opened--;
        // A closer written on its own line (`  </span>\n`) takes the indent with it. Whitespace
        // with nothing on either side of it belongs to the wrapper, and leaving it behind turns
        // every highlighted line into a blank one.
        const tail = /^[ \t]*\n/.exec(source.slice(tag.end));
        if (tail) {
          // Strip that indent from the text collected so far. Only the trailing run is touched,
          // so this never rebuilds the block: the run is a handful of characters.
          let end = piece.length;
          while (end > 0 && (piece[end - 1] === ' ' || piece[end - 1] === '\t')) end--;
          piece = piece.slice(0, end);
          if (piece) { parts.push(piece); piece = ''; }
          parts.push('\n');
          i = tag.end + tail[0].length;
          continue;
        }
      }
      i = tag.end;
      continue;
    }

    if (!opensMarkup(tag)) { piece += ch; i++; continue; }
    opened++;
    i = tag.end;
  }
  if (piece) parts.push(piece);
  return decodeEntities(parts.join('')).replace(/^\n+|\s+$/g, '');
}

// Collapse runs of whitespace without touching the ends. Trimming is the block's job, not
// each run's: the space in `<code>x</code> and` sits between two runs, and trimming them
// separately would run the words together.
function squeeze(input) {
  return String(input)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n');
}

function collapse(input) {
  return squeeze(input).trim();
}

// Source newlines are insignificant whitespace in HTML, so they collapse to spaces.
function cleanText(input) {
  return collapse(decodeEntities(stripTags(input)).replace(/\n/g, ' '));
}


// Percent-decoding lives in parse.js, once: the fragment a link carries is decoded when the
// link is parsed, and extract() receives it already decoded. Decoding here as well folded a
// literal `%2520` in a heading twice — `%2520` -> `%20` -> a space — and answered a fragment
// the page never wrote.

function resolveMaxBlocks(maxBlocks) {
  const n = typeof maxBlocks === 'number' ? maxBlocks : Number(maxBlocks);
  // No argument means the ceiling; a caller may still ask for less.
  if (!Number.isFinite(n) || n <= 0) return BLOCK_CEILING;
  return Math.min(BLOCK_CEILING, Math.floor(n));
}

function emptyResult() {
  return { title: '', blocks: [], truncated: false, headingMiss: false, missName: '', error: '' };
}

function errorResult(message) {
  const result = emptyResult();
  result.error = message;
  return result;
}

// --- block extraction -----------------------------------------------------

// A block element ends where the next one begins, so an unclosed <p> or <li> is closed
// implicitly rather than swallowing everything after it.
function impliedClose(stack, newTag, closeFrame) {
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.tag === 'p') { closeFrame('p'); continue; }
    if (top.tag === 'li' && newTag === 'li') { closeFrame('li'); continue; }
    if (HEADING_TAG.test(top.tag) && HEADING_TAG.test(newTag)) { closeFrame(top.tag); continue; }
    break;
  }
}

// A block's text is kept twice: as one plain string (`text`), which is what heading
// matching and the tests compare, and — when the block contains inline code — as a list of
// `parts` so the renderer can draw the code as code instead of prose. `parts` is absent for
// the ordinary case, where the whole block is one run of text.
function partsToText(parts) {
  let out = '';
  for (const part of parts) out += part.text;
  return out;
}

function appendPart(parts, text, code) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && !last.code && !code) {
    last.text += text;
    return;
  }
  if (last && last.code && code) {
    last.text += text;
    return;
  }
  parts.push({ text, code: !!code });
}

// The language of a code block. Documentation sites spell it several ways, and none of
// them agree, so each convention is tried in turn:
//
//   language-python / lang-js   Prism and the common Markdown renderers
//   highlight-python3           Sphinx, and so the Python docs
//   brush: js                   Alex Gorbatchev's highlighter, and so MDN
//   data-lang="go"              a plain attribute some sites use
//
// A name ending in a version digit is trimmed, because `python3` is not a Prism grammar
// but `python` is. Empty when the page says nothing — then the block is still drawn as a
// code block, just uncoloured.
function codeLang(attrs) {
  const a = attrs || '';
  // The class attribute's value, read attribute by attribute like every other attribute —
  // quoted and unquoted spellings alike (`<pre class=language-python>` is ordinary markup).
  const hay = attrValue(a, 'class') || '';

  let name = '';
  const patterns = [
    /(?:^|\s)(?:language|lang)-([A-Za-z0-9+#._-]+)/,
    /(?:^|\s)highlight-([A-Za-z0-9+#._-]+)/,
    /brush:\s*([A-Za-z0-9+#._-]+)/,
  ];
  for (const re of patterns) {
    const m = re.exec(hay) || re.exec(a);
    if (m) { name = m[1]; break; }
  }
  if (!name) {
    name = attrValue(a, 'data-lang') || attrValue(a, 'data-language') || '';
  }
  if (!name) return '';

  name = name.toLowerCase();
  // `python3` -> `python`, `html5` -> `html`: the digit is the language's version, not part
  // of its name.
  const trimmed = name.replace(/\d+$/, '');
  return PRISM_ALIAS[trimmed] || PRISM_ALIAS[name] || trimmed;
}

// Site spellings that are not Prism grammar ids.
const PRISM_ALIAS = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  csharp: 'csharp',
  'c#': 'csharp',
  cpp: 'cpp',
  'c++': 'cpp',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  yml: 'yaml',
  md: 'markdown',
  golang: 'go',
  rb: 'ruby',
  rs: 'rust',
};

// The tags whose still-open presence can lend a <pre> its language. The old backward scan
// matched these spellings with a regex; the set is kept exactly as it was.
const WRAPPER_TAGS = new Set(['div', 'figure', 'section', 'table']);

// The language declared by a tag INSIDE a <pre>'s body — the `<code>` element Sphinx and
// GitHub put the class on. Only the tags' attribute regions are read, each with the same
// quote-aware scanner the walk uses: the body between the tags is code, and code that
// happens to contain the words `language-java` is prose, not a declaration. (This used to
// be `codeLang(inner.slice(0, 200))`, which read the body itself and let a sentence name
// the block's language.)
function innerCodeLang(inner) {
  let i = 0;
  while (i < inner.length) {
    const lt = inner.indexOf('<', i);
    if (lt === -1) return '';
    i = lt + 1;
    if (!opensTag(inner, lt)) continue;
    const tag = scanTag(inner, lt);
    if (tag === null || tag.notATag || tag.closing) continue;
    const lang = codeLang(tag.rest);
    if (lang) return lang;
    i = tag.end;
  }
  return '';
}

// The language declared by a wrapper that is still OPEN around this <pre> — Sphinx writes
// `<div class="highlight-python3"><div class="highlight"><pre>`, and the inner wrapper says
// nothing. Walked backward with the same scanner, counting wrappers by name: a `<div>`
// closer between the <pre> and an opener means that opener closed before the <pre> began,
// so it is not an ancestor and must not speak for it. The old 400-character backward regex
// matched every opener in the window whether it was still open or not, so one wrapper's
// language leaked onto every later block on the page.
function wrapperLang(src, from, window) {
  const floor = Math.max(0, from - (window == null ? 400 : window));
  const depth = new Map();
  let i = from;
  for (;;) {
    // `lastIndexOf` clamps a negative from-index to 0, which would find this very `<` again
    // forever — the pre at the very start of a document is the case. I runs strictly
    // downward instead, and the walk ends when there is nothing left to search before it.
    if (i <= 0) return '';
    const lt = src.lastIndexOf('<', i - 1);
    if (lt === -1 || lt < floor) return '';
    i = lt;
    if (!opensTag(src, lt)) continue;
    const tag = scanTag(src, lt);
    if (tag === null || tag.notATag) continue;
    const name = tag.name.toLowerCase();
    if (!WRAPPER_TAGS.has(name)) continue;
    const d = depth.get(name) || 0;
    if (tag.closing) { depth.set(name, d + 1); continue; }
    // An opener this <pre> has not seen a closer for is an ancestor: a candidate.
    if (d > 0) { depth.set(name, d - 1); continue; }
    const lang = codeLang(tag.rest);
    if (lang) return lang;
  }
}

// The id a page puts on a heading. A link's fragment addresses *this*, not the heading's
// text — rustdoc is the clearest case: the heading reads `pub const fn new() -> Vec<T>` and
// its id is `method.new`, and the link people copy out of the address bar says `#method.new`.
// Read attribute by attribute with `attrValue`, not with a regex over the region: `\bid\s*=`
// also matches the `id` inside `data-id` (the `-` before it is a word boundary) and inside
// another attribute's value (`aria-label="id='fake'"`), and an id read from either is an
// anchor the page never declared — a fragment could then land on the wrong heading.
function headingId(attrs) {
  return attrValue(attrs || '', 'id') || '';
}

function walkBlocks(src) {
  const blocks = [];
  const stack = [];
  let pending = [];

  // Set at the edge of a block-level element and spent by the next text that arrives. Two
  // neighbouring blocks' words would otherwise run together (<div>hello</div><div>world</div>
  // reads as "helloworld"). Spending it lazily rather than writing a space straight away keeps
  // a trailing space out of a block that turns out to end there.
  let pendingBreak = false;

  // Whether the buffer last written to ends in whitespace. Kept as a flag rather than read
  // off the text, because a buffer's text is one growing string and testing its tail would
  // walk it again on every block edge.
  const tailSpace = new WeakMap();

  // Ids opened by containers and not yet closed. rustdoc puts the anchor on a `<section>`
  // wrapping the heading (`<section id="method.new"><h4>pub const fn new()…`), so a heading
  // with no id of its own takes the nearest enclosing one — that is what the page's own
  // fragment links address.
  //
  // The stack holds every element still open, in document order, not only the ones carrying an
  // id: nesting is what tells an <li> in a nested list from the <li> around that list, and a
  // close has to take the ids of everything it closes along with it.
  const openEls = [];   // [{ tag, id }]
  // The nearest id at or below each depth, so inheriting one stays O(1) however deep the
  // markup nests.
  const idAt = [];

  // Entities are decoded here, once, rather than as text is gathered — a `&amp;` can be
  // split across two text runs, and it has to be decoded after the pieces are joined or it
  // would never match.
  //
  // Whitespace is collapsed per part but NOT trimmed per part: the space in
  // `<code>x</code> and` belongs between two parts, and trimming each one separately would
  // run them together. Only the block's own ends are trimmed, below.
  const clean = (str, isCode) => {
    const decoded = decodeEntities(str);
    // Collapsing is for prose; a code block's spacing is meaningful.
    return isCode ? decoded : squeeze(decoded);
  };

  const push = (type, parts, level, lang, id) => {
    const list = typeof parts === 'string' ? [{ text: parts, code: type === 'pre' }] : parts;

    const cleaned = [];
    for (const part of list) {
      const text = clean(part.text, part.code);
      if (text) cleaned.push({ text, code: part.code });
    }

    // The block's outer edges: drop leading space on the first run, trailing on the last.
    if (cleaned.length) {
      cleaned[0].text = cleaned[0].text.replace(/^\s+/, '');
      const last = cleaned[cleaned.length - 1];
      last.text = last.text.replace(/\s+$/, '');
    }

    const text = partsToText(cleaned);
    if (!text.trim()) return;

    const block = { type };
    if (level !== undefined) block.level = level;
    block.text = text;
    if (lang) block.lang = lang;
    // Kept for heading matching: a fragment may address the id rather than the text.
    if (id) block.id = id;
    // Only worth carrying when something in the block is actually code.
    if (typeof parts !== 'string' && cleaned.some((p) => p.code)) block.parts = cleaned;
    blocks.push(block);
  };

  // Spend the break recorded at the last block-level edge, if any. It goes into whichever
  // buffer the incoming text lands in, because a run of code is a word too:
  // <div><code>x</code></div><div>y</div> is "x y" and not "xy". Nothing is added when the
  // buffer is empty (the block ended at that edge, so the break has nothing to separate) or
  // when whitespace is already on either side of it, so a source space does not become two.
  const takeBreak = (parts, chunk, isCode) => {
    if (!pendingBreak) return;
    pendingBreak = false;
    if (!parts.length) return;
    if (/^\s/.test(chunk)) return;
    if (tailSpace.get(parts)) return;
    // Punctuation that attaches to the word before it must not be pushed away by the break:
    // <div>end</div>, more is "end, more", not "end , more".
    if (CLOSING_PUNCT.test(chunk)) return;
    const last = parts[parts.length - 1];
    // The break is code only when it sits between two code runs, where it belongs to the one
    // span and keeps <code>x</code><div><code>y</code></div> a single "x y". Against prose it
    // is prose, or the renderer would draw a code span with a leading space in it.
    appendPart(parts, ' ', last.code && isCode);
  };

  // Both writers go through the same three steps: spend a pending break, append the chunk,
  // and remember whether that chunk left whitespace at the end of the buffer.
  const write = (chunk, isCode) => {
    const parts = stack.length ? stack[stack.length - 1].parts : pending;
    takeBreak(parts, chunk, isCode);
    appendPart(parts, chunk, isCode);
    tailSpace.set(parts, /\s$/.test(chunk));
  };

  const appendText = (chunk) => { if (chunk) write(chunk, false); };
  const appendCode = (chunk) => { if (chunk) write(chunk, true); };


  // Source newlines are insignificant whitespace in HTML; only <br> and <pre> mean a break.
  // How many inline <code> elements we are inside. Text gathered while this is non-zero
  // is inline code, and the renderer draws it as such.
  let codeDepth = 0;

  // Inline code belongs to the block it was opened in. A `<code>` with no `</code>` before
  // the block ends is broken markup, and HTML closes it there: the end of the paragraph,
  // heading, list item or quote is the end of the formatting too. Keeping the count across a
  // block boundary lets one such tag swallow every block after it, so every block boundary
  // resets it — see `boundary()` below, which every open *and* close of a block goes through.
  const endInlineCode = () => { codeDepth = 0; };

  const appendSource = (chunk) => {
    const text = chunk.replace(/\n/g, ' ');
    if (codeDepth > 0) appendCode(text);
    else appendText(text);
  };

  const emitFrame = (frame) => {
    push(frame.type, frame.parts, frame.level, undefined, frame.id);
  };

  // Text a frame gathered before a block opened inside it was read before that block, so it
  // has to go out before it — a quote's lead-in belongs above the paragraph inside it, not
  // below. Every open frame is released outermost first, from its own start to this point.
  // A frame keeps its place in the stack with an empty buffer, so the text read after the
  // boundary lands in the same frame, after what was just released.
  const releaseFrames = () => {
    for (const frame of stack) {
      if (!frame.parts.length) continue;
      push(frame.type, frame.parts, frame.level, undefined, frame.id);
      frame.parts = [];
    }
  };

  // A block boundary: what is running ends here, including an unclosed <code>.
  const boundary = () => {
    endInlineCode();
    flushPending();
    releaseFrames();
  };

  const flushPending = () => {
    if (!pending.length) return;
    const parts = pending;
    pending = [];
    // Trailing whitespace inside a paragraph is invisible but would show up in `text`.
    const last = parts[parts.length - 1];
    if (last && !last.code) last.text = last.text.replace(/\s+$/, '');
    const first = parts[0];
    if (first && !first.code) first.text = first.text.replace(/^\s+/, '');
    push('p', parts);
  };

  const popTo = (index) => {
    openEls.length = index;
    idAt.length = index;
  };

  const closeFrame = (tag) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag !== tag) continue;
      // The block that held the inline code is over, whether or not `</code>` ever came.
      endInlineCode();
      const frames = stack.splice(i);
      for (const frame of frames) emitFrame(frame);
      return;
    }
  };

  // A closing tag ends the element it names and everything still open inside it: `</ul>` with
  // an <li> still open ends the <li> too, and takes its id with it.
  const closeExplicitEl = (tag) => {
    for (let i = openEls.length - 1; i >= 0; i--) {
      if (openEls[i].tag === tag) { popTo(i); return; }
    }
  };

  // End the elements an opening tag ends implicitly, exactly as HTML does: the tag's own group
  // (an <li> ends an <li>, an <option> ends an <option>), searched no further than that group's
  // container, plus an open <p>, which no block-level element may live inside. An implicit
  // close ends the element, so its id goes with it.
  const impliedCloseEls = (tag) => {
    if (BLOCK_LEVEL.has(tag)) {
      for (let i = openEls.length - 1; i >= 0; i--) {
        const t = openEls[i].tag;
        if (t === 'p') { popTo(i); break; }
        if (!INLINE_LEVEL.has(t)) break;
      }
    }
    const rule = IMPLIED_CLOSE.get(tag);
    if (!rule) return;
    // One tag can end more than one open element: an <optgroup> ends the open <option> AND
    // the group before it, so the search has to start over after every pop instead of
    // stopping at the first element of the group it finds. It still stops at the group's
    // container, so an element outside that container is never touched.
    for (;;) {
      let found = -1;
      for (let i = openEls.length - 1; i >= 0; i--) {
        const t = openEls[i].tag;
        if (rule.ends.indexOf(t) >= 0) { found = i; break; }
        if (rule.scope.indexOf(t) >= 0) break;
      }
      if (found < 0) break;
      popTo(found);
    }
  };

  // Ids on containers are tracked separately from the block stack: the block stack only
  // holds things that become blocks, and a `<section>` is not one.
  // Ids are let go both when the closing tag arrives and when a block ends implicitly.
  // An implicitly closed `<h2 id="a">` has no `</h2>`, so without this the entry stayed on
  // the stack for good and every later heading inherited an anchor that was already spent.

  const noteContainerId = (tag, attrs, closing) => {
    if (closing) {
      closeExplicitEl(tag);
      return;
    }
    // A void element encloses nothing, so it is not a container: `<hr id="sep">` is a rule
    // with a stray id, not a section, and remembering it left the id on the stack for every
    // heading after it — with no `<hr>` closing tag ever coming to take it off again.
    if (VOID_TAGS.has(tag)) return;
    // The same implied close has to happen on the element stack, because these tags never
    // become blocks and `impliedClose` therefore never runs for them: an id left behind here
    // would be inherited by every heading after it, exactly as a spent heading id was.
    impliedCloseEls(tag);
    const id = headingId(attrs);
    openEls.push({ tag, id });
    idAt.push(id || (idAt.length ? idAt[idAt.length - 1] : ''));
  };

  // The nearest enclosing id, which a heading with none of its own inherits.
  const enclosingId = () => (openEls.length ? idAt[openEls.length - 1] : '');

  // `id` may be a function: a heading inherits the nearest container's id, and that has to
  // be read *after* the implied close has run, or an implicitly closed heading still hands
  // its id back to the heading that closes it.
  const pushFrame = (type, tag, level, id) => {
    boundary();
    impliedClose(stack, tag, closeFrame);
    stack.push({ tag, type, level, id: typeof id === 'function' ? id() : id, parts: [] });
  };

  const re = /<\/?([a-zA-Z][a-zA-Z0-9:_-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let lastIndex = 0;
  let match;

  while ((match = re.exec(src)) !== null) {
    const raw = match[0];
    const tag = match[1].toLowerCase();
    const attrs = match[2] || '';
    const closing = raw.charAt(1) === '/';
    const selfClosing = /\/\s*>$/.test(raw.replace(/"[^"]*"|'[^']*'/g, ''));

    if (match.index > lastIndex) appendSource(src.slice(lastIndex, match.index));

    // The text read so far ends where this block-level element starts, and the text after it
    // begins a new word. The break is only written once that text actually arrives.
    if (BLOCK_TAGS.has(tag)) pendingBreak = true;

    if (tag === 'br') { appendText('\n'); lastIndex = re.lastIndex; continue; }

    // <pre> is read verbatim: tags inside it are content, not block structure, and its
    // line breaks are the point of it. Its language comes from its own class, or from the
    // <code> inside it — that is where documentation sites put it.
    if (tag === 'pre' && !closing) {
      const closer = /<\/pre\s*>/gi;
      closer.lastIndex = re.lastIndex;
      const close = closer.exec(src);
      const inner = src.slice(re.lastIndex, close ? close.index : src.length);
      // The language may sit on the <pre>, on a tag inside it (the <code> element), or on a
      // wrapper just outside — Sphinx puts it on a `<div class="highlight-python3">` two
      // levels up, and the inner wrapper (`class="highlight"`) says nothing. Innermost
      // first; a wrapper speaks for the pre only while it is still open around it.
      let lang = codeLang(attrs) || innerCodeLang(inner);
      if (!lang) lang = wrapperLang(src, match.index);
      const text = codeText(inner);
      if (stack.length) { appendCode(text); }
      else { boundary(); push('pre', text, undefined, lang); }
      re.lastIndex = close ? closer.lastIndex : src.length;
      lastIndex = re.lastIndex;
      // This branch consumes the closing tag itself, so the generic block-edge marking above
      // never sees it. A <pre> inside a container still separates the text on either side.
      pendingBreak = true;
      continue;
    }

    lastIndex = re.lastIndex;
    if (selfClosing) continue;

    // Ids on containers are booked around the block stack, not before it. A start tag that
    // both carries an id and closes a previous block of its own kind — `<li id="b">` after
    // `<li id="a">` — must let the implied close release the old id FIRST: releasing
    // "the most recent li" after the new id was pushed would take the new one and leave the
    // spent one behind, which is the very bug this fixes.
    //
    // A closing tag releases the id it names, once. `closeFrame` no longer touches the id
    // stack at all: the block stack's implicit closes approximate block emission, and an
    // <li> in a nested <ul> is not the end of the <li> around that <ul>. An explicit close is
    // also the only place a container that never becomes a block is ever let go of, so this
    // call must not be skipped for any tag.
    const noteId = () => noteContainerId(tag, attrs, closing);
    if (closing) noteId();

    // <code> inside running text is inline code: its text is marked so the renderer can
    // draw it in a monospace chip rather than as ordinary words. A <code> directly inside
    // <pre> was already consumed above, so this only sees the inline kind.
    if (tag === 'code') {
      if (!closing) noteId();
      codeDepth = closing ? Math.max(0, codeDepth - 1) : codeDepth + 1;
      continue;
    }

    const heading = HEADING_TAG.exec(tag);
    if (heading) {
      if (closing) closeFrame(tag);
      else {
        // The heading's own id wins; otherwise it takes the nearest container's. The block
        // level <h*> ends an open <p> first, so a heading after a paragraph is not inside it.
        // A heading is never booked on the stack: its id is its own anchor, not a container's.
        impliedCloseEls(tag);
        const own = headingId(attrs);
        pushFrame('h', tag, Number(heading[1]), own || enclosingId);
      }
      continue;
    }

    const type = EMITTING_TAGS[tag];
    if (type) {
      if (closing) closeFrame(tag); else pushFrame(type, tag);
      if (!closing) noteId();
      continue;
    }

    if (!closing) noteId();
  }

  // The text after the last tag is content like any other. Without this the page loses its
  // final sentence whenever the document ends in prose rather than in a closing tag, and a
  // document with no tags at all comes back empty.
  if (lastIndex < src.length) appendSource(src.slice(lastIndex));
  // Then close whatever was still open. Everything above runs first so the tail lands in
  // the frame it belongs to, and <p>a</p>tail keeps tail after the paragraph rather than ahead
  // of it.
  for (const frame of stack.splice(0)) emitFrame(frame);
  flushPending();
  return blocks;
}

// --- the article body -----------------------------------------------------

// A page is mostly chrome: navigation, sidebars, footers, a cookie banner. The prose sits
// inside one container, and every documentation site names it one of a few ways. Taking
// that container when it exists is the difference between previewing an article and
// previewing a menu.
//
// The `id="content"` and `role="main"` spellings are here because the sites people link
// to use them: Wikipedia and MDN use <main>, Python's docs use role="main".
//
// These are predicates over a *scanned* tag (see scanTag) rather than regexes over the source.
// A regex has to spell out how a tag ends, and `[^>]*` — the only way to do that without
// understanding quotes — stops at the first `>` even when it sits inside an attribute value:
// `<main data-x="a>b">` was read as a `<main data-x="a` tag, and the rest of the attribute
// leaked into the body as text. scanTag already skips quoted values, so it hands back the
// whole tag and the attributes can be read off `rest`.
const BODY_IDS = new Set(['content', 'main', 'main-content', 'primary']);
// The tag name the `role` / `id` spellings accept. `[a-z]+\b` is the name test the old regexes
// applied, kept as-is so the set of tags that count as a container does not move: `<div
// role="main">` and `<my-div role="main">` still match, while `<h1 id="content">` still does
// not — a heading that happens to carry `id="content"` must not become the body, or the prose
// under it would be dropped from the preview.
const ATTR_TAG_NAME = /^[a-z]+\b/i;
const BODY_OPENERS = [
  (tag) => /^main\b/i.test(tag.name),
  (tag) => /^article\b/i.test(tag.name),
  (tag) => ATTR_TAG_NAME.test(tag.name) && (attrValue(tag.rest, 'role') || '').toLowerCase() === 'main',
  (tag) => ATTR_TAG_NAME.test(tag.name) && BODY_IDS.has((attrValue(tag.rest, 'id') || '').toLowerCase()),
];

// The value of attribute `name` in a scanned tag's `rest` (the text between the end of the tag
// name and its `>`), or null when the tag does not carry it.
//
// Walked attribute by attribute rather than searched for with a regex, because the `rest` of
// `<div data-x="role='main'">` contains the text `role='main'` and a search would read an
// attribute out of another attribute's value. Values are skipped to their end — a quoted one to
// its closing quote, which is the whole reason `rest` is trustworthy here, and an unquoted one
// to the first whitespace, which is where HTML ends it — so an attribute is never matched from
// inside another attribute's value.
function attrValue(rest, name) {
  let k = 0;
  while (k < rest.length) {
    // Attributes are separated by whitespace; a stray `/` is the self-closing slash.
    while (k < rest.length && /[\s/]/.test(rest[k])) k++;
    const start = k;
    while (k < rest.length && !/[\s=/>]/.test(rest[k])) k++;
    const attr = rest.slice(start, k);
    // The name may be followed by whitespace before the `=`.
    let eq = k;
    while (eq < rest.length && /\s/.test(rest[eq])) eq++;
    // A `>` can sit inside `rest`: scanOpenTag skips quoted values, so a stray quote in a
    // malformed tag (`<div role=main t="a"b">`) makes it swallow the real tag end, and the
    // name scan above then stops on that `>`, which the leading skip does not consume. Stepping
    // only to `k` would spin on that same index forever, so step past the character inspected.
    // `k + 1`, not `eq + 1`: when the name is followed by whitespace then no `=`, `eq` sits on
    // the next attribute's first character, and skipping to `eq + 1` would lose it — that is
    // how `<div hidden role="main">` stopped being seen as a container.
    if (rest[eq] !== '=') { k = k + 1; continue; }
    k = eq + 1;
    while (k < rest.length && /\s/.test(rest[k])) k++;
    const quote = rest[k];
    if (quote === '"' || quote === "'") {
      const close = rest.indexOf(quote, k + 1);
      if (close === -1) return null;
      const value = rest.slice(k + 1, close);
      if (attr.toLowerCase() === name) return value;
      k = close + 1;
      continue;
    }
    // An unquoted value runs to the first whitespace — that is the whole HTML grammar for
    // it (`rest` never contains the `>`, which ended the tag). `<h2 id=install>` and
    // `<pre class=language-python>` are ordinary markup, and the page's own anchor and
    // language spellings must survive them the way they survive quotes.
    const valueStart = k;
    while (k < rest.length && !/[\s]/.test(rest[k])) k++;
    if (attr.toLowerCase() === name) return rest.slice(valueStart, k);
  }
  return null;
}

// A tag read for the body-container search, which differs from scanTag in one place: the name
// may contain a colon. Namespaced spellings are real — Word writes `<o:p>` into the HTML it
// exports, and XHTML writes `<svg:rect>` — and the patterns this replaced accepted them, since
// `[a-z]+\b` ends at the colon. scanTag deliberately stops at the colon because a code block
// showing `<svg:rect/>` must keep it as text; the two readers therefore ask different questions
// and get different answers, which is why this one is local to the body search.
//
// Everything else matches scanTag: quoted attribute values are skipped, so a `>` inside one does
// not end the tag, and a name not followed by a tag boundary is not a tag at all.
function scanOpenTag(text, i) {
  let k = i + 1;
  const closing = text[k] === '/';
  if (closing) k++;
  const start = k;
  while (k < text.length && /[A-Za-z0-9:_-]/.test(text[k])) k++;
  const name = text.slice(start, k);
  if (!/[A-Za-z]/.test(name.charAt(0))) return null;
  const next = text[k];
  if (!(next === '>' || next === '/' || isTagBoundary(next))) return null;
  while (k < text.length && text[k] !== '>') {
    const ch = text[k];
    if (ch === '"' || ch === "'") {
      const close = text.indexOf(ch, k + 1);
      if (close === -1) return null;
      k = close + 1;
      continue;
    }
    k++;
  }
  if (k >= text.length) return null;
  return { end: k + 1, name, closing, rest: text.slice(start + name.length, k) };
}

// The first opening tag in `src` that `matches` accepts, or null. Scanned for the same reason
// the openers are predicates: a regex would stop at a `>` inside a quoted attribute value.
function findBodyOpen(src, matches) {
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) return null;
    if (!opensTag(src, lt)) { i = lt + 1; continue; }
    const tag = scanOpenTag(src, lt);
    if (tag === null) { i = lt + 1; continue; }
    if (!tag.closing && matches(tag)) return tag;
    i = tag.end;
  }
  return null;
}

// Where the closer matching an opening tag of `name` starts, counting nested same-name tags so
// a <div> inside a <div> does not end the body early; -1 when the page never closes it. This
// is the second half of the same defect: `<div class="a>b">` counted as one tag by a `[^>]*`
// regex throws the depth off by one and slices the body at the wrong `</div>`.
function matchingCloserAt(src, from, name) {
  let depth = 1;
  let i = from;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) return -1;
    if (!opensTag(src, lt)) { i = lt + 1; continue; }
    const tag = scanOpenTag(src, lt);
    if (tag === null) { i = lt + 1; continue; }
    if (tag.name.toLowerCase() === name) {
      // A closer counts only in the spelling the old `</name\s*>` pattern accepted: nothing
      // between the name and the `>` but whitespace. `</name/>` and `</name class="x">` were
      // not closers before this fix, and making them closers now would end the body earlier
      // than it used to and drop the text after it — a narrower preview is worse than a
      // wider one.
      if (tag.closing && !/^\s*$/.test(tag.rest)) { i = tag.end; continue; }
      depth += tag.closing ? -1 : 1;
      if (depth === 0) return lt;
    }
    i = tag.end;
  }
  return -1;
}

// The page's own content, when it declares a container for it; the whole document when it
// does not. Falling back to the whole document matters: a page without <main> is still a
// page, and showing its chrome beats showing nothing.
function articleBody(src) {
  for (const opener of BODY_OPENERS) {
    const open = findBodyOpen(src, opener);
    if (!open) continue;
    const from = open.end;
    const closeAt = matchingCloserAt(src, from, open.name.toLowerCase());
    if (closeAt === -1) continue;
    const body = src.slice(from, closeAt);
    // An empty container is worse than the whole page: it means we guessed wrong.
    if (body.trim()) return body;
  }
  return src;
}

// --- heading matching -----------------------------------------------------

// --- public API -----------------------------------------------------------

function extract(html, heading, maxBlocks) {
  const result = emptyResult();
  const limit = resolveMaxBlocks(maxBlocks);
  let src;
  try {
    src = html === undefined || html === null ? '' : String(html);
    src = src.replace(/\r\n?/g, '\n');

    // A doctype is not a paragraph. Left in place its `<!doctype html>` survives tag
    // stripping as literal text and lands at the top of every preview.
    src = src.replace(/<!doctype\b[^>]*>/gi, ' ');

    // Scripts, styles and comments are not content; dropping them first means the block
    // walker never has to think about them.
    src = src
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(src);
    if (title) result.title = cleanText(title[1]);

    // The head is metadata; only the title was wanted from it.
    src = src.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ');
    src = src.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, ' ');

    src = articleBody(src);
    let blocks = walkBlocks(src);

    // The fragment arrives percent-decoded — parse.js owns the decoding, and doing it here
    // too would fold a literal `%2520` twice and hand the section search a heading the page
    // never wrote. selectBlocks trims.
    const picked = selectBlocks(blocks, heading);
    if (picked.miss) {
      result.headingMiss = true;
      result.missName = picked.miss;
      result.blocks = [];
      return result;
    }
    blocks = picked.blocks;

    if (blocks.length > limit) { blocks = blocks.slice(0, limit); result.truncated = true; }
    result.blocks = blocks;
  } catch (err) {
    result.error = 'Failed to parse HTML: ' + ((err && err.message) || String(err));
    result.blocks = [];
  }
  return result;
}

function lookupHeader(headers, name) {
  if (!headers) return '';
  const wanted = name.toLowerCase();
  if (typeof headers.get === 'function') {
    const value = headers.get(name);
    return value === undefined || value === null ? '' : String(value);
  }
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) {
      const value = headers[key];
      return value === undefined || value === null ? '' : String(value);
    }
  }
  return '';
}

// The `text/*` subtypes that really are HTML. Every other `text/*` — plain, csv, markdown,
// javascript, css, xml — has no HTML semantics, so the parser would collapse its whitespace
// and quietly eat runs that merely look like tags. An allowlist is the only honest shape
// for this branch: the markup subtypes of `text/*` are a couple of names we can enumerate,
// while the plain ones are open-ended, so a denylist would silently mis-parse whatever
// `text/…` came next. (The `application/*` branches below are left as they were; they are
// keyed on a different, narrower family and are not part of this choice.)
const MARKUP_TEXT_SUBTYPES = new Set(['html', 'xhtml']);

// Whether a response should go through the HTML parser. A missing content type is treated as
// markup, because that is the common case for a page; so is a malformed one, since we cannot
// tell what it meant. Everything else is handed to `textBodyResult`, which shows it as one
// block with its newlines kept (it still trims trailing whitespace and normalises CRLF).
function isMarkupContentType(contentType) {
  if (!contentType) return true;
  const match = /^\s*([a-z0-9.+-]+)\/([a-z0-9.+-]+)/i.exec(contentType);
  if (!match) return true;
  const type = match[1].toLowerCase();
  const subtype = match[2].toLowerCase();
  if (type === 'text') return MARKUP_TEXT_SUBTYPES.has(subtype);
  if (type === 'application' && (subtype === 'xml' || subtype === 'xhtml+xml')) return true;
  if (type === 'application' && /\+xml$/.test(subtype)) return true;
  return false;
}

function textBlock(body) {
  const text = body.replace(/\s+$/, '');
  if (!text.trim()) return null;
  return { type: 'pre', text };
}

// A response that is not markup — raw source, JSON, plain text — is shown as one block,
// cut to `maxBlocks` lines.
function textBodyResult(text, maxBlocks) {
  const result = emptyResult();
  const limit = resolveMaxBlocks(maxBlocks);
  const lines = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > limit) {
    result.truncated = true;
    result.blocks = [textBlock(lines.slice(0, limit).join('\n'))].filter(Boolean);
  } else {
    result.blocks = [textBlock(lines.join('\n'))].filter(Boolean);
  }
  return result;
}

async function fetchSection(url, heading, maxBlocks) {
  let requestUrl;
  try {
    // Required here, not at module scope: `extract` must stay usable — and testable —
    // outside Obsidian, where this module does not exist.
    ({ requestUrl } = require('obsidian'));
  } catch (err) {
    return errorResult('obsidian module unavailable: ' + ((err && err.message) || String(err)));
  }
  if (typeof requestUrl !== 'function') return errorResult('requestUrl is unavailable');

  let response;
  try {
    // `throw: false`, as fetchText does: Obsidian's requestUrl throws on a non-2xx status
    // unless told otherwise, and a thrown error would carry its own wording — the status
    // branch below would never run, and the reader would see whatever requestUrl felt like
    // saying instead of which status the page answered with.
    response = await requestUrl({ url, throw: false });
  } catch (err) {
    return errorResult((err && err.message) || String(err));
  }

  const status = response && typeof response.status === 'number' ? response.status : null;
  // A missing status is not a status of 0 — "HTTP 0" tells the reader nothing. No status
  // code means the response could not be judged, and that is what the panel should say.
  if (status === null) return errorResult('HTTP status unknown');
  if (status < 200 || status >= 300) return errorResult('HTTP ' + status);

  const body = response && typeof response.text === 'string' ? response.text : '';
  const contentType = lookupHeader(response && response.headers, 'content-type');

  if (!isMarkupContentType(contentType)) return textBodyResult(body, maxBlocks);
  return extract(body, heading, maxBlocks);
}

// Test seam: consumed only by test/ — kept so the tests can reach in without a // second entry point. Production code does not read these.
// (`extract` is the test-only seam; fetchSection is the API.)
module.exports = { extract, fetchSection };
