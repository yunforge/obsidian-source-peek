'use strict';

// Reading a line window out of a source file, from disk or from a fetched string.
//
// Everything here is about one question: given "lines 18 to 23 of this file", what text
// do we show? The slicing is pure so it can be tested; only the disk read touches fs.

const fs = require('fs');
const readline = require('readline');

// A minified bundle is one enormous line. Showing it would wreck the preview, so each
// line is capped and the cap is announced with an ellipsis.
const MAX_LINE = 500;
// Past this many lines, Prism tokenizing starts to stall the UI; the caller falls back
// to plain text instead. The single source of the threshold: render.js reads it from
// here, so the plain-text fallback cannot fork between callers.
const PRISM_MAX_LINES = 5000;
// Reading a whole file to show three lines is wasteful; this bounds the window.
const MAX_WINDOW_LINES = 4000;

// Extension without the dot, lower-cased. `../src/main.C` and `../src/main.c` are the
// same language, and a dotfile like `.gitignore` has no extension.
//
// A path may mix '/' and '\' (a Windows link pasted into a vault, a hand-typed path), so
// the basename starts after whichever separator comes last — both indices are measured
// against the original string and sliced once.
function extOf(path) {
  const s = String(path == null ? '' : path);
  const base = s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

// Which Prism grammar colours a file. The names are Prism's own; anything we don't know
// still gets a passable generic highlight rather than no highlight at all.
const PRISM_BY_EXT = {
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp',
  cs: 'csharp',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', tsx: 'tsx',
  py: 'python', pyw: 'python',
  java: 'java',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  scala: 'scala',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  lua: 'lua',
  pl: 'perl',
  r: 'r',
  sql: 'sql',
  json: 'json',
  yml: 'yaml', yaml: 'yaml',
  toml: 'toml',
  xml: 'markup', html: 'markup', htm: 'markup', svg: 'markup',
  css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  md: 'markdown', markdown: 'markdown',
  dart: 'dart',
  ex: 'elixir', exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  clj: 'clojure',
  groovy: 'groovy',
  vim: 'vim',
  ps1: 'powershell',
  asm: 'nasm', s: 'nasm',
  tex: 'latex',
};

function langFor(path) {
  return PRISM_BY_EXT[extOf(path)] || 'clike';
}

// The window [from..to] out of `text`, 1-based and inclusive.
//
// Returns { startLine, lines, truncated } or null when `from` is past the end (the file
// shrank since the link was written, or the line never existed). `to` is clamped to the
// last line, so a range running off the end still shows what is there.
function sliceLines(text, from, to, cap) {
  const limit = cap == null ? MAX_WINDOW_LINES : cap;
  const src = String(text == null ? '' : text);
  const all = src.split(/\r\n|\r|\n/);
  // A trailing newline yields one empty element; it is not a line of the file.
  if (all.length > 1 && all[all.length - 1] === '') all.pop();
  if (!all.length) return null;

  let start = Math.max(1, from | 0 || 1);
  if (start > all.length) return null;
  let end = Math.min(all.length, Math.max(start, (to == null ? start : to | 0) || start));

  let truncated = false;
  if (end - start + 1 > limit) {
    end = start + limit - 1;
    truncated = true;
  }

  const lines = all.slice(start - 1, end).map((line) =>
    line.length > MAX_LINE ? line.slice(0, MAX_LINE) + '…' : line);

  return { startLine: start, lines, truncated };
}

// Where a local path actually lives, or null when it points outside the vault.
//
// Two forms, and the leading slash is what tells them apart:
//
//   ./src/main.rs      relative to the note that holds the link
//   ../02_use_paths/   also relative — `..` walks up from the note
//   /src/main.rs       from the vault root
//
// Nothing may resolve above the vault. This plugin previews a notebook's own code; a link
// out of the vault is not a case to support, and a link to someone else's repository is a
// web link, not a file one. Refusing is also what keeps a note from reaching `/etc/passwd`.
//
// `vaultRoot` is required for that check. Without it the path is resolved but not
// confined, which is what the tests do.
function resolveLocal(target, noteDir, vaultRoot) {
  const nodePath = require('path');
  const raw0 = String(target == null ? '' : target).trim();
  if (!raw0) return null;

  // A link pasted out of Windows spells its folders with backslashes, and the plugin's
  // parsing half already reads `\` as a separator everywhere (`extOf` splits a basename on
  // whichever separator came last, `looksLikeSourceFile` likewise) — so the file names a
  // language and parses fine. Node on macOS/Linux, though, treats `\` as an ordinary
  // character in a path, and the very link that parsed would refuse to open. Normalising
  // here makes the reading layer agree with the parsing layer. (A vault file genuinely
  // named with a backslash is not something the parse layer ever supported either.)
  const raw = raw0.replace(/\\/g, '/');

  const root = vaultRoot ? nodePath.resolve(vaultRoot) : null;

  // A leading slash means the vault root, not the filesystem's. Notes are written for a
  // vault, and `/src/main.rs` reads as "from the top of my vault" far more naturally than
  // as an absolute machine path.
  let abs;
  if (raw.startsWith('/') || raw.startsWith('\\')) {
    if (!root) return null;
    abs = nodePath.resolve(root, '.' + nodePath.sep + raw.replace(/^[/\\]+/, ''));
  } else {
    abs = nodePath.resolve(noteDir || root || '.', raw);
  }

  if (root) {
    const rel = nodePath.relative(root, abs);
    // `..` at the front means it climbed out; `''` means it is the vault itself, which is
    // not a file either.
    if (!rel || rel === '..' || rel.split(nodePath.sep)[0] === '..') return null;
  }

  return abs;
}

// Stream just the window off disk rather than the whole file, so a 50 MB source file
// previews as fast as a small one. Returns { startLine, lines, truncated } or null.
function readWindow(absPath, from, to, cap) {
  const limit = cap == null ? MAX_WINDOW_LINES : cap;
  return new Promise((resolve) => {
    const start = Math.max(1, from | 0 || 1);
    const want = to == null ? start : Math.max(start, to | 0 || start);
    const lines = [];
    let truncated = false;
    let i = 0;
    let stream;
    try {
      stream = fs.createReadStream(absPath, { encoding: 'utf8' });
    } catch {
      resolve(null);
      return;
    }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const stop = () => {
      try { rl.close(); } catch { /* already closed */ }
      try { stream.destroy(); } catch { /* already gone */ }
    };
    rl.on('line', (line) => {
      i++;
      if (i < start) return;
      if (i > want) { stop(); return; }
      if (lines.length >= limit) { truncated = true; stop(); return; }
      lines.push(line.length > MAX_LINE ? line.slice(0, MAX_LINE) + '…' : line);
    });
    rl.on('close', () => resolve(lines.length ? { startLine: start, lines, truncated } : null));
    // A read error surfaces on both objects; answer each so neither stays unhandled.
    rl.on('error', () => resolve(null));
    stream.on('error', () => resolve(null));
  });
}

// Test seam: consumed only by test/ — kept so the tests can reach in without a // second entry point. Production code does not read these.
module.exports = {
  extOf,
  langFor,
  sliceLines,
  resolveLocal,
  readWindow,
  MAX_LINE,
  MAX_WINDOW_LINES,
  PRISM_MAX_LINES,
};
