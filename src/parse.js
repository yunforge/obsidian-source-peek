'use strict';

// Turning the text of a link into a preview target.
//
// Two families, and the target string is the only thing that decides which:
//
//   code  — a source file, located by path, pinned to a line or a range.
//           `../src/main.c#L18`        (local, relative to the note)
//           `https://github.com/o/r/blob/main/src/main.c#L18-L23`   (remote repo)
//
//   web   — a page, optionally narrowed to one heading.
//           `https://example.com/page#install`
//
// A code target without a `#L` fragment is not a target at all: nothing tells us
// which line the reader meant, and the whole point of the plugin is the line.

const { rawUrlFor } = require('./remote');
const { extOf } = require('./code');

// A `#L` fragment, GitHub's spelling: `L18`, `L18-23`, `L18-L23`.
const LINE_FRAGMENT = /^L(\d+)(?:-L?(\d+))?$/i;

// Parse the fragment that follows `#` on a code link. Returns { from, to } or null
// when it is not a line fragment (a heading slug, for instance, or nothing at all).
function parseLineFragment(fragment) {
  const m = LINE_FRAGMENT.exec(String(fragment == null ? '' : fragment).trim());
  if (!m) return null;
  const from = parseInt(m[1], 10);
  const to = m[2] == null ? from : parseInt(m[2], 10);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  // A backwards range is read the way the author meant it rather than rejected.
  return from <= to ? { from, to } : { from: to, to: from };
}

// Obsidian autolinks write the target between angle brackets: `<../src/main.c#L18>`.
// Strip them so the same string parses either way.
function unwrap(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s.length > 1 && s.startsWith('<') && s.endsWith('>')) return s.slice(1, -1).trim();
  return s;
}

// Percent-decoding a fragment can throw on a malformed escape; the raw text is a
// better answer than an exception in that case.
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

const isHttp = (s) => /^https?:\/\//i.test(s);

// The text after the first `#`. A `#` inside the path (rare) would be percent-encoded
// by anything that generated the link, so the first one is the fragment separator.
function splitFragment(s) {
  const i = s.indexOf('#');
  if (i === -1) return { base: s, fragment: '' };
  return { base: s.slice(0, i), fragment: s.slice(i + 1) };
}

// The code-root-relative path a remote blob URL points at, or null when the URL is
// not a blob URL on a host we can turn into a raw one.
function remoteTarget(url, fragment) {
  const info = rawUrlFor(url);
  if (!info) return null;
  const lines = parseLineFragment(fragment);
  if (!lines) return null;
  // `rawUrl` is the whole identity of a remote target (keying, fetching); `host` is what
  // the header label shows; `path` names the file for the label and the language. The
  // blob URL itself is not carried: nothing reads it once the raw twin is known.
  return {
    kind: 'code',
    source: 'remote',
    rawUrl: info.rawUrl,
    host: info.host,
    path: info.path,
    from: lines.from,
    to: lines.to,
  };
}

// Whether a local path names a source file, which is the only thing a `#L` fragment can
// mean. A bare `#L18` on something that is not code is a heading in a vault note whose
// name happens to be `L18`, not a line reference.
//
// The test is the extension of the basename, never "does the path contain a slash": a
// dated note (`notes/meeting.2024-10-20`) or a versioned one (`projects/v1.2`) sits in a
// folder and is still a note.
//
//   a code extension      ../src/main.c, app.js, docs/a.md    → source file
//   a known bare name     Makefile, Dockerfile, scripts/build  → source file, read as clike
//   anything else, no extension   Note, README, Notes/Some note → a note
//   any other extension   2024-10-20, v1.2, .env, .gitignore   → not a source file
//
// `extOf` is the rule the rest of the plugin already uses, so a path is split into basename
// and extension here exactly as the code view splits it. A note is not a file the editor
// can show, so the answer needs the set of extensions that are code — the same set
// `src/code.js` highlights. `langFor` cannot answer this on its own: it maps anything it
// does not know to 'clike', so it says "yes" to every extension.
//
// A basename with no extension is the hard case. `extOf` puts `Makefile` and `Note` in the
// same bucket ('') even though one is source and the other is the name of a vault note, so
// the extension alone cannot decide it. The files that are known by name are listed, and a
// path that aims at one of them is source. Everything else with no extension is read as a
// note — `Note`, `Notes/Some note`, `Daily Notes/2024-10-20` — because a vault note keeps
// its name in a folder and `#L18` on it names a heading. Giving the benefit of the doubt to
// "note" is the safe direction: a note link shown as a line of code is the bug, while a
// rare extensionless file that nobody listed is simply not previewed.
const CODE_NAMES = new Set([
  'makefile', 'dockerfile', 'containerfile', 'cmakelists.txt', 'jenkinsfile',
  'rakefile', 'gemfile', 'procfile', 'vagrantfile', 'justfile',
  // Scripts that are run, not notes that are read.
  'build', 'configure', 'install', 'waf', 'gradlew', 'mvnw',
]);

const CODE_EXTENSIONS = new Set([
  'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx', 'cs',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'pyw', 'java', 'go', 'rs', 'rb', 'php',
  'swift', 'kt', 'kts', 'scala', 'sh', 'bash', 'zsh', 'lua', 'pl', 'r', 'sql',
  'json', 'yml', 'yaml', 'toml', 'xml', 'html', 'htm', 'svg', 'css', 'scss', 'sass', 'less',
  'md', 'markdown', 'dart', 'ex', 'exs', 'erl', 'hs', 'clj', 'groovy', 'vim', 'ps1',
  'asm', 's', 'tex',
]);

function looksLikeSourceFile(path) {
  const s = String(path == null ? '' : path);
  const base = s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1);
  const ext = extOf(s);

  // A dotfile with no second dot is a name, not a file with an extension: `.gitignore` and
  // `.env` are ordinary vault notes. `src/code.js` calls them extensionless for the same
  // reason, and `test/code.test.js:23` pins it.
  if (ext === '') {
    if (base.lastIndexOf('.') === 0) return false;
    return CODE_NAMES.has(base.toLowerCase());
  }
  return CODE_EXTENSIONS.has(ext);
}

// The whole job: one string in, one target or null out.
function parseTarget(raw) {
  const s = unwrap(raw);
  if (!s) return null;

  const { base, fragment } = splitFragment(s);

  if (isHttp(base)) {
    const remote = remoteTarget(base, fragment);
    if (remote) return remote;
    // Anything else on the web is a page to preview, heading and all.
    return { kind: 'web', url: base, heading: fragment ? safeDecode(fragment) : '' };
  }

  // A local path only becomes a target once it says which line — and only if it names a
  // source file at all. `Note#L18` is a link to the heading `L18` of a vault note, and no
  // amount of "it has a #L" makes it a line of anything.
  const lines = parseLineFragment(fragment);
  if (!lines || !base) return null;
  if (!looksLikeSourceFile(base)) return null;
  return { kind: 'code', source: 'local', path: base, from: lines.from, to: lines.to };
}

// Every target sitting in one line of text, with where the pointer may rest on it.
// (Nothing rewrites the line any more: the offsets that matter are `hitStart`/`hitEnd`,
// what the consumer checks the pointer against, and those are what findTargets reports.)
//
// Three shapes carry a target:
//   [text](target)     the destination of a markdown link
//   <target>           an autolink
//   target             a bare target (a URL, or a path with a line fragment)
const AUTOLINK = /<([^<>\s]+)>/g;
// A bare run of non-space characters, trimmed of the punctuation that tends to hug a
// URL in prose (trailing `.`/`,`/`)`, wrapping quotes).
const BARE = /[^\s]+/g;

const skipSpace = (text, i) => {
  let k = i;
  while (k < text.length && /\s/.test(text[k])) k++;
  return k;
};

// A markdown link's destination starts just after its `(`. Markdown allows paired
// parentheses in a destination — `Foo_(bar)`, which Wikipedia and MDN lean on — so the
// scan counts nesting instead of stopping at the first `)`. A destination may also be
// wrapped in `<...>`, which is how one holding spaces gets written; the brackets are not
// part of it, the same as for an autolink.
function scanDestination(text, i) {
  if (text[i] === '<') {
    const close = text.indexOf('>', i + 1);
    if (close === -1) return null;
    const raw = text.slice(i + 1, close);
    // `<>` is not a destination; the brackets only wrap one.
    if (!raw) return null;
    return { raw, start: i + 1, end: close, next: close + 1 };
  }
  let depth = 0;
  let j = i;
  for (; j < text.length; j++) {
    const ch = text[j];
    if (/\s/.test(ch)) break;
    if (ch === '(') { depth++; continue; }
    if (ch !== ')') continue;
    if (depth === 0) break;
    depth--;
  }
  // An unclosed `(` means this is not a destination after all; an empty one is not either.
  if (depth !== 0 || j === i) return null;
  return { raw: text.slice(i, j), start: i, end: j, next: j };
}

// Where the link's `)` sits: straight after the destination, or after the optional title
// that markdown separates from the destination with whitespace. -1 when there is none.
function linkClose(text, i) {
  const k = skipSpace(text, i);
  // A title needs that whitespace: `[a](b"t")` is a malformed destination, not a titled
  // link, and reading it as one would invent a target the text does not have.
  if (k > i && text[k] === '"') {
    const quote = text.indexOf('"', k + 1);
    if (quote === -1) return -1;
    const after = skipSpace(text, quote + 1);
    return text[after] === ')' ? after : -1;
  }
  return text[k] === ')' ? k : -1;
}

// Every markdown link on the line, with the offsets of its destination. The label keeps the
// older, simpler rule — anything but `]` — because nothing in a preview target lives there.
function markdownLinks(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '[') continue;
    const labelEnd = text.indexOf(']', i + 1);
    if (labelEnd === -1 || text[labelEnd + 1] !== '(') continue;
    const dest = scanDestination(text, labelEnd + 2);
    if (!dest) continue;
    const close = linkClose(text, dest.next);
    if (close === -1) continue;
    out.push({ start: dest.start, end: dest.end, raw: dest.raw, spanStart: i, spanEnd: close + 1 });
    // Resume after this link: a destination may itself hold `[`/`]`, and those must not be
    // read as the start of another link.
    i = close;
  }
  return out;
}

function collect(text, re, group) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[group];
    const start = m.index + m[0].indexOf(raw);
    out.push({
      start,
      end: start + raw.length,
      raw,
      // The whole construct, which is what the pointer actually rests on: for a markdown
      // link that includes the visible text and the brackets, not just the destination.
      spanStart: m.index,
      spanEnd: m.index + m[0].length,
    });
  }
  return out;
}

const stripEdges = (s) => s.replace(/^[("'`[]+/, '').replace(/[)"'`\].,;:]+$/, '');

// Two spans that share any character are the same finding written two ways — a markdown
// link's destination is also a bare run of non-space text, and an autolink is too. The
// earlier, more specific pass wins; a later span that overlaps it is dropped rather than
// reported alongside it, or one link would answer twice and the pointer's hit test would
// have two spans to argue about.
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

function findTargets(text) {
  const s = String(text == null ? '' : text);
  const found = [];

  // `hitStart`/`hitEnd` bound what the pointer may rest on to mean it. For a markdown link
  // that is not the destination itself: the reader points at the visible words. Reporting
  // only the destination made the preview fire when the pointer reached the end of the link
  // and not when it was over the text — which is where it naturally is. The destination
  // offsets are working values here (the bare pass derives its hit area from them); they
  // are not part of the reported result, whose only offsets are the hit area.
  const push = (start, end, raw, hitStart, hitEnd) => {
    if (!raw || end <= start) return;
    const from = hitStart == null ? start : hitStart;
    const to = hitEnd == null ? end : hitEnd;
    if (found.some((f) => overlaps({ start: f.hitStart, end: f.hitEnd }, { start: from, end: to }))) return;
    const target = parseTarget(raw);
    if (target) found.push({ hitStart: from, hitEnd: to, target, raw });
  };

  // Order matters: most specific first, so the overlap rule keeps the better reading.
  for (const hit of markdownLinks(s)) {
    push(hit.start, hit.end, hit.raw, hit.spanStart, hit.spanEnd);
  }
  for (const hit of collect(s, AUTOLINK, 1)) {
    push(hit.start, hit.end, hit.raw, hit.spanStart, hit.spanEnd);
  }

  for (const hit of collect(s, BARE, 0)) {
    const trimmed = stripEdges(hit.raw);
    if (!trimmed) continue;
    // Keep the offsets honest when punctuation was trimmed away.
    const start = hit.start + hit.raw.indexOf(trimmed);
    push(start, start + trimmed.length, trimmed);
  }

  found.sort((a, b) => a.hitStart - b.hitStart || a.hitEnd - b.hitEnd);
  return found;
}

// Test seam: consumed only by test/ — kept so the tests can reach in without a // second entry point. Production code does not read these.
// (`parseLineFragment` is the test-only seam; parseTarget and findTargets are the API.)
module.exports = { parseTarget, parseLineFragment, findTargets };
