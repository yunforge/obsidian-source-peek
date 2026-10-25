/* Source Peek 1.0.1 — bundled from src/ by esbuild. Do not edit directly; edit src/ and run "npm run build". */
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// src/remote.js
var require_remote = __commonJS({
  "src/remote.js"(exports2, module2) {
    "use strict";
    var GITHUB_BLOB = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i;
    var GITLAB_BLOB = /^https?:\/\/(?:www\.)?gitlab\.com\/(.+?)\/-\/blob\/([^/]+)\/(.+)$/i;
    function rawUrlFor(url) {
      const s = String(url == null ? "" : url).trim();
      if (!s) return null;
      const gh = GITHUB_BLOB.exec(s);
      if (gh) {
        const [, owner, repo, ref, path] = gh;
        return {
          host: "github",
          path,
          rawUrl: "https://raw.githubusercontent.com/" + owner + "/" + repo + "/" + ref + "/" + path
        };
      }
      const gl = GITLAB_BLOB.exec(s);
      if (gl) {
        const [, group, ref, path] = gl;
        return {
          host: "gitlab",
          path,
          rawUrl: "https://gitlab.com/" + group + "/-/raw/" + ref + "/" + path
        };
      }
      return null;
    }
    var MAX_REMOTE_CHARS = 2 * 1024 * 1024;
    async function fetchText(url, maxChars) {
      const cap = maxChars == null ? MAX_REMOTE_CHARS : maxChars;
      let requestUrl;
      try {
        ({ requestUrl } = require("obsidian"));
      } catch (e) {
        return { ok: false, text: "", error: "requestUrl unavailable: " + (e && e.message ? e.message : e) };
      }
      try {
        const res = await requestUrl({ url, throw: false });
        const status = res && typeof res.status === "number" ? res.status : null;
        if (status === null) {
          return { ok: false, text: "", error: "HTTP status unknown" };
        }
        if (status < 200 || status >= 300) {
          return { ok: false, text: "", error: "HTTP " + status };
        }
        let text = res && typeof res.text === "string" ? res.text : "";
        if (text.length > cap) text = text.slice(0, cap);
        return { ok: true, text, error: "" };
      } catch (e) {
        return { ok: false, text: "", error: e && e.message ? e.message : String(e) };
      }
    }
    module2.exports = { rawUrlFor, fetchText, MAX_REMOTE_CHARS };
  }
});

// src/code.js
var require_code = __commonJS({
  "src/code.js"(exports2, module2) {
    "use strict";
    var fs = require("fs");
    var readline = require("readline");
    var MAX_LINE = 500;
    var PRISM_MAX_LINES = 5e3;
    var MAX_WINDOW_LINES = 4e3;
    function extOf(path) {
      const s = String(path == null ? "" : path);
      const base = s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\")) + 1);
      const dot = base.lastIndexOf(".");
      if (dot <= 0) return "";
      return base.slice(dot + 1).toLowerCase();
    }
    var PRISM_BY_EXT = {
      c: "c",
      h: "c",
      cpp: "cpp",
      cc: "cpp",
      cxx: "cpp",
      hpp: "cpp",
      hh: "cpp",
      hxx: "cpp",
      cs: "csharp",
      js: "javascript",
      mjs: "javascript",
      cjs: "javascript",
      jsx: "jsx",
      ts: "typescript",
      tsx: "tsx",
      py: "python",
      pyw: "python",
      java: "java",
      go: "go",
      rs: "rust",
      rb: "ruby",
      php: "php",
      swift: "swift",
      kt: "kotlin",
      kts: "kotlin",
      scala: "scala",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      lua: "lua",
      pl: "perl",
      r: "r",
      sql: "sql",
      json: "json",
      yml: "yaml",
      yaml: "yaml",
      toml: "toml",
      xml: "markup",
      html: "markup",
      htm: "markup",
      svg: "markup",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      md: "markdown",
      markdown: "markdown",
      dart: "dart",
      ex: "elixir",
      exs: "elixir",
      erl: "erlang",
      hs: "haskell",
      clj: "clojure",
      groovy: "groovy",
      vim: "vim",
      ps1: "powershell",
      asm: "nasm",
      s: "nasm",
      tex: "latex"
    };
    function langFor(path) {
      return PRISM_BY_EXT[extOf(path)] || "clike";
    }
    function sliceLines(text, from, to, cap) {
      const limit = cap == null ? MAX_WINDOW_LINES : cap;
      const src = String(text == null ? "" : text);
      const all = src.split(/\r\n|\r|\n/);
      if (all.length > 1 && all[all.length - 1] === "") all.pop();
      if (!all.length) return null;
      let start = Math.max(1, from | 0 || 1);
      if (start > all.length) return null;
      let end = Math.min(all.length, Math.max(start, (to == null ? start : to | 0) || start));
      let truncated = false;
      if (end - start + 1 > limit) {
        end = start + limit - 1;
        truncated = true;
      }
      const lines = all.slice(start - 1, end).map((line) => line.length > MAX_LINE ? line.slice(0, MAX_LINE) + "\u2026" : line);
      return { startLine: start, lines, truncated };
    }
    function resolveLocal2(target, noteDir, vaultRoot) {
      const nodePath2 = require("path");
      const raw0 = String(target == null ? "" : target).trim();
      if (!raw0) return null;
      const raw = raw0.replace(/\\/g, "/");
      const root = vaultRoot ? nodePath2.resolve(vaultRoot) : null;
      let abs;
      if (raw.startsWith("/") || raw.startsWith("\\")) {
        if (!root) return null;
        abs = nodePath2.resolve(root, "." + nodePath2.sep + raw.replace(/^[/\\]+/, ""));
      } else {
        abs = nodePath2.resolve(noteDir || root || ".", raw);
      }
      if (root) {
        const rel = nodePath2.relative(root, abs);
        if (!rel || rel === ".." || rel.split(nodePath2.sep)[0] === "..") return null;
      }
      return abs;
    }
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
          stream = fs.createReadStream(absPath, { encoding: "utf8" });
        } catch (e) {
          resolve(null);
          return;
        }
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        const stop = () => {
          try {
            rl.close();
          } catch (e) {
          }
          try {
            stream.destroy();
          } catch (e) {
          }
        };
        rl.on("line", (line) => {
          i++;
          if (i < start) return;
          if (i > want) {
            stop();
            return;
          }
          if (lines.length >= limit) {
            truncated = true;
            stop();
            return;
          }
          lines.push(line.length > MAX_LINE ? line.slice(0, MAX_LINE) + "\u2026" : line);
        });
        rl.on("close", () => resolve(lines.length ? { startLine: start, lines, truncated } : null));
        rl.on("error", () => resolve(null));
        stream.on("error", () => resolve(null));
      });
    }
    module2.exports = {
      extOf,
      langFor,
      sliceLines,
      resolveLocal: resolveLocal2,
      readWindow,
      MAX_LINE,
      MAX_WINDOW_LINES,
      PRISM_MAX_LINES
    };
  }
});

// src/parse.js
var require_parse = __commonJS({
  "src/parse.js"(exports2, module2) {
    "use strict";
    var { rawUrlFor } = require_remote();
    var { extOf } = require_code();
    var LINE_FRAGMENT = /^L(\d+)(?:-L?(\d+))?$/i;
    function parseLineFragment(fragment) {
      const m = LINE_FRAGMENT.exec(String(fragment == null ? "" : fragment).trim());
      if (!m) return null;
      const from = parseInt(m[1], 10);
      const to = m[2] == null ? from : parseInt(m[2], 10);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    function unwrap(raw) {
      const s = String(raw == null ? "" : raw).trim();
      if (s.length > 1 && s.startsWith("<") && s.endsWith(">")) return s.slice(1, -1).trim();
      return s;
    }
    function safeDecode(s) {
      try {
        return decodeURIComponent(s);
      } catch (e) {
        return s;
      }
    }
    var isHttp = (s) => /^https?:\/\//i.test(s);
    function splitFragment(s) {
      const i = s.indexOf("#");
      if (i === -1) return { base: s, fragment: "" };
      return { base: s.slice(0, i), fragment: s.slice(i + 1) };
    }
    function remoteTarget(url, fragment) {
      const info = rawUrlFor(url);
      if (!info) return null;
      const lines = parseLineFragment(fragment);
      if (!lines) return null;
      return {
        kind: "code",
        source: "remote",
        rawUrl: info.rawUrl,
        host: info.host,
        path: info.path,
        from: lines.from,
        to: lines.to
      };
    }
    var CODE_NAMES = /* @__PURE__ */ new Set([
      "makefile",
      "dockerfile",
      "containerfile",
      "cmakelists.txt",
      "jenkinsfile",
      "rakefile",
      "gemfile",
      "procfile",
      "vagrantfile",
      "justfile",
      // Scripts that are run, not notes that are read.
      "build",
      "configure",
      "install",
      "waf",
      "gradlew",
      "mvnw"
    ]);
    var CODE_EXTENSIONS = /* @__PURE__ */ new Set([
      "c",
      "h",
      "cpp",
      "cc",
      "cxx",
      "hpp",
      "hh",
      "hxx",
      "cs",
      "js",
      "mjs",
      "cjs",
      "jsx",
      "ts",
      "tsx",
      "py",
      "pyw",
      "java",
      "go",
      "rs",
      "rb",
      "php",
      "swift",
      "kt",
      "kts",
      "scala",
      "sh",
      "bash",
      "zsh",
      "lua",
      "pl",
      "r",
      "sql",
      "json",
      "yml",
      "yaml",
      "toml",
      "xml",
      "html",
      "htm",
      "svg",
      "css",
      "scss",
      "sass",
      "less",
      "md",
      "markdown",
      "dart",
      "ex",
      "exs",
      "erl",
      "hs",
      "clj",
      "groovy",
      "vim",
      "ps1",
      "asm",
      "s",
      "tex"
    ]);
    function looksLikeSourceFile(path) {
      const s = String(path == null ? "" : path);
      const base = s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\")) + 1);
      const ext = extOf(s);
      if (ext === "") {
        if (base.lastIndexOf(".") === 0) return false;
        return CODE_NAMES.has(base.toLowerCase());
      }
      return CODE_EXTENSIONS.has(ext);
    }
    function parseTarget2(raw) {
      const s = unwrap(raw);
      if (!s) return null;
      const { base, fragment } = splitFragment(s);
      if (isHttp(base)) {
        const remote = remoteTarget(base, fragment);
        if (remote) return remote;
        return { kind: "web", url: base, heading: fragment ? safeDecode(fragment) : "" };
      }
      const lines = parseLineFragment(fragment);
      if (!lines || !base) return null;
      if (!looksLikeSourceFile(base)) return null;
      return { kind: "code", source: "local", path: base, from: lines.from, to: lines.to };
    }
    var AUTOLINK = /<([^<>\s]+)>/g;
    var BARE = /[^\s]+/g;
    var skipSpace = (text, i) => {
      let k = i;
      while (k < text.length && /\s/.test(text[k])) k++;
      return k;
    };
    function scanDestination(text, i) {
      if (text[i] === "<") {
        const close = text.indexOf(">", i + 1);
        if (close === -1) return null;
        const raw = text.slice(i + 1, close);
        if (!raw) return null;
        return { raw, start: i + 1, end: close, next: close + 1 };
      }
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        const ch = text[j];
        if (/\s/.test(ch)) break;
        if (ch === "(") {
          depth++;
          continue;
        }
        if (ch !== ")") continue;
        if (depth === 0) break;
        depth--;
      }
      if (depth !== 0 || j === i) return null;
      return { raw: text.slice(i, j), start: i, end: j, next: j };
    }
    function linkClose(text, i) {
      const k = skipSpace(text, i);
      if (k > i && text[k] === '"') {
        const quote = text.indexOf('"', k + 1);
        if (quote === -1) return -1;
        const after = skipSpace(text, quote + 1);
        return text[after] === ")" ? after : -1;
      }
      return text[k] === ")" ? k : -1;
    }
    function markdownLinks(text) {
      const out = [];
      for (let i = 0; i < text.length; i++) {
        if (text[i] !== "[") continue;
        const labelEnd = text.indexOf("]", i + 1);
        if (labelEnd === -1 || text[labelEnd + 1] !== "(") continue;
        const dest = scanDestination(text, labelEnd + 2);
        if (!dest) continue;
        const close = linkClose(text, dest.next);
        if (close === -1) continue;
        out.push({ start: dest.start, end: dest.end, raw: dest.raw, spanStart: i, spanEnd: close + 1 });
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
          spanEnd: m.index + m[0].length
        });
      }
      return out;
    }
    var stripEdges = (s) => s.replace(/^[("'`[]+/, "").replace(/[)"'`\].,;:]+$/, "");
    var overlaps = (a, b) => a.start < b.end && b.start < a.end;
    function findTargets2(text) {
      const s = String(text == null ? "" : text);
      const found = [];
      const push = (start, end, raw, hitStart, hitEnd) => {
        if (!raw || end <= start) return;
        const from = hitStart == null ? start : hitStart;
        const to = hitEnd == null ? end : hitEnd;
        if (found.some((f) => overlaps({ start: f.hitStart, end: f.hitEnd }, { start: from, end: to }))) return;
        const target = parseTarget2(raw);
        if (target) found.push({ hitStart: from, hitEnd: to, target, raw });
      };
      for (const hit of markdownLinks(s)) {
        push(hit.start, hit.end, hit.raw, hit.spanStart, hit.spanEnd);
      }
      for (const hit of collect(s, AUTOLINK, 1)) {
        push(hit.start, hit.end, hit.raw, hit.spanStart, hit.spanEnd);
      }
      for (const hit of collect(s, BARE, 0)) {
        const trimmed = stripEdges(hit.raw);
        if (!trimmed) continue;
        const start = hit.start + hit.raw.indexOf(trimmed);
        push(start, start + trimmed.length, trimmed);
      }
      found.sort((a, b) => a.hitStart - b.hitStart || a.hitEnd - b.hitEnd);
      return found;
    }
    module2.exports = { parseTarget: parseTarget2, parseLineFragment, findTargets: findTargets2 };
  }
});

// src/sections.js
var require_sections = __commonJS({
  "src/sections.js"(exports2, module2) {
    "use strict";
    function slugify(input) {
      return String(input).normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
    }
    function headingMatches(block, name) {
      if (!block || block.type !== "h") return false;
      const wanted = String(name).trim();
      if (!wanted) return false;
      if (block.id && block.id.toLowerCase() === wanted.toLowerCase()) return true;
      const slug = slugify(wanted);
      if (!slug) return block.text.trim().toLowerCase() === wanted.toLowerCase();
      if (slugify(block.text) === slug) return true;
      if (block.id && slugify(block.id) === slug) return true;
      return block.text.trim().toLowerCase() === wanted.toLowerCase();
    }
    function findHeading(blocks, name, start) {
      const from = start == null ? 0 : Math.max(0, start);
      for (let i = from; i < blocks.length; i++) {
        if (headingMatches(blocks[i], name)) return i;
      }
      return -1;
    }
    function sectionEnd(blocks, index) {
      const level = blocks[index].level || 1;
      for (let i = index + 1; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.type === "h" && (block.level || 1) <= level) return i;
      }
      return blocks.length;
    }
    function whole(blocks) {
      return { from: 0, to: blocks.length, miss: "" };
    }
    function miss(name) {
      return { from: 0, to: 0, miss: name };
    }
    function resolveRange(blocks, fragment) {
      const text = String(fragment == null ? "" : fragment).trim();
      if (!text) return whole(blocks);
      if (text.startsWith("-")) {
        const name = text.slice(1);
        if (!name) return whole(blocks);
        const end = findHeading(blocks, name, 0);
        if (end <= 0) return miss(name);
        return { from: 0, to: end, miss: "" };
      }
      if (text.endsWith("-")) {
        const name = text.slice(0, -1);
        if (!name) return whole(blocks);
        const start = findHeading(blocks, name, 0);
        if (start < 0) return miss(name);
        return { from: start, to: blocks.length, miss: "" };
      }
      const exact = findHeading(blocks, text, 0);
      if (exact >= 0) return { from: exact, to: sectionEnd(blocks, exact), miss: "" };
      for (let i = text.indexOf("-"); i !== -1; i = text.indexOf("-", i + 1)) {
        const left = text.slice(0, i);
        const right = text.slice(i + 1);
        if (!left || !right) continue;
        const from = findHeading(blocks, left, 0);
        if (from < 0) continue;
        const to = findHeading(blocks, right, from + 1);
        if (to < 0) continue;
        return { from, to, miss: "" };
      }
      return miss(text);
    }
    function selectBlocks(blocks, fragment) {
      const range = resolveRange(blocks, fragment);
      if (range.miss) return { blocks: [], miss: range.miss };
      return { blocks: blocks.slice(range.from, range.to), miss: "" };
    }
    module2.exports = { selectBlocks, resolveRange, slugify, findHeading, sectionEnd };
  }
});

// src/web.js
var require_web = __commonJS({
  "src/web.js"(exports2, module2) {
    "use strict";
    var { selectBlocks } = require_sections();
    var BLOCK_CEILING = 2e3;
    var NAMED_ENTITIES = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
      ensp: " ",
      emsp: " ",
      thinsp: " ",
      copy: "\xA9",
      reg: "\xAE",
      trade: "\u2122",
      hellip: "\u2026",
      mdash: "\u2014",
      ndash: "\u2013",
      middot: "\xB7",
      laquo: "\xAB",
      raquo: "\xBB",
      times: "\xD7",
      divide: "\xF7",
      deg: "\xB0",
      plusmn: "\xB1",
      frac12: "\xBD",
      bull: "\u2022",
      ldquo: "\u201C",
      rdquo: "\u201D",
      lsquo: "\u2018",
      rsquo: "\u2019",
      sect: "\xA7",
      para: "\xB6",
      euro: "\u20AC",
      pound: "\xA3",
      yen: "\xA5",
      cent: "\xA2"
    };
    var EMITTING_TAGS = { p: "p", li: "li", blockquote: "quote" };
    var HEADING_TAG = /^h([1-6])$/;
    var IMPLIED_CLOSE = /* @__PURE__ */ new Map([
      ["li", { ends: ["li"], scope: ["ul", "ol", "menu"] }],
      ["dt", { ends: ["dt", "dd"], scope: ["dl"] }],
      ["dd", { ends: ["dt", "dd"], scope: ["dl"] }],
      ["option", { ends: ["option"], scope: ["select", "datalist", "optgroup"] }],
      ["optgroup", { ends: ["option", "optgroup"], scope: ["select", "datalist"] }],
      ["tr", { ends: ["tr", "td", "th"], scope: ["table", "thead", "tbody", "tfoot"] }],
      ["td", { ends: ["td", "th"], scope: ["tr", "table"] }],
      ["th", { ends: ["td", "th"], scope: ["tr", "table"] }]
    ]);
    var BLOCK_LEVEL = new Set("address article aside blockquote caption details dialog div dl dd dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main menu nav ol p pre search section summary table tbody td tfoot th thead tr ul".split(" "));
    var INLINE_LEVEL = new Set("a abbr b bdi bdo br cite code data del dfn em i ins kbd label mark q s samp small span strong sub sup time u var wbr".split(" "));
    var VOID_TAGS = new Set("area base br col embed hr img input link meta param source track wbr basefont bgsound frame isindex keygen".split(" "));
    var BLOCK_TAGS = new Set("address article aside blockquote details dialog div dl dd dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section summary table tbody td tfoot th thead tr ul caption colgroup menu search option optgroup select legend center dir".split(" "));
    var CLOSING_PUNCT = /^[,.;:!?%)\]}》」』、，。；：！？）】]/;
    function decodeEntities(input) {
      return String(input).replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
        if (body.charAt(0) === "#") {
          const hex = body.charAt(1) === "x" || body.charAt(1) === "X";
          const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
          if (!Number.isFinite(code) || code < 0 || code > 1114111) return match;
          try {
            return String.fromCodePoint(code);
          } catch (err) {
            return match;
          }
        }
        const named = NAMED_ENTITIES[body.toLowerCase()];
        return named === void 0 ? match : named;
      });
    }
    function stripTags(input) {
      return String(input).replace(/<[^>]*>/g, "");
    }
    var HTML_TAGS = new Set("a abbr acronym address applet area article aside audio b base basefont bdi bdo bgsound big blink blockquote body br button canvas caption center cite code col colgroup command content data datalist dd del details dfn dialog dir div dl dt element em embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe image img input ins isindex kbd keygen label legend li link listing main map mark marquee menu menuitem meta meter multicol nav nextid nobr noembed noframes noscript object ol optgroup option output p param picture plaintext pre progress q rb rp rt rtc ruby s samp script search section select shadow slot small source spacer span strike strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr xmp math mrow mfrac msqrt mroot mstyle merror mpadded mphantom mtable mtr mtd mlabeledtr menclose mspace munder mover munderover mmultiscripts mprescripts none maction semantics annotation mi mn mo ms mtext path circle ellipse rect g line polygon polyline text tspan defs use symbol marker pattern mask clippath foreignobject lineargradient radialgradient stop".split(" "));
    function isMarkupName(name) {
      const lower = name.toLowerCase();
      return HTML_TAGS.has(lower) || lower.indexOf("-") >= 0;
    }
    function scanTag(text, i) {
      let k = i + 1;
      const closing = text[k] === "/";
      if (closing) k++;
      const start = k;
      while (k < text.length && /[A-Za-z0-9-]/.test(text[k])) k++;
      const name = text.slice(start, k);
      if (!name) return null;
      if (!isTagBoundary(text[k]) && text[k] !== ">" && text[k] !== "/") {
        return text[k] === "<" ? null : { end: i + 1, notATag: true };
      }
      while (k < text.length && text[k] !== ">") {
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
    function opensTag(text, i) {
      return i + 1 < text.length && (text[i + 1] === "/" || /[A-Za-z]/.test(text[i + 1]));
    }
    function isTagBoundary(ch) {
      return ch === " " || ch === "	" || ch === "\n" || ch === "\r" || ch === "/";
    }
    function opensMarkup(tag) {
      const rest = tag.rest;
      if (rest.length === 0) return isMarkupName(tag.name);
      if (!isTagBoundary(rest[0])) return false;
      return true;
    }
    function closesWrapper(tag, open) {
      return open > 0 && tag !== null && tag.closing && isMarkupName(tag.name);
    }
    function scanDeclaration(text, i) {
      if (text.startsWith("<!--", i)) {
        const close2 = text.indexOf("-->", i + 4);
        return close2 === -1 ? text.length : close2 + 3;
      }
      if (text.startsWith("<![CDATA[", i)) {
        const close2 = text.indexOf("]]>", i + 9);
        return { cdata: true, from: i + 9, end: close2 === -1 ? text.length : close2 };
      }
      if (text.startsWith("<?", i)) {
        const close2 = text.indexOf("?>", i + 2);
        return close2 === -1 ? text.length : close2 + 2;
      }
      const close = text.indexOf(">", i + 2);
      return close === -1 ? text.length : close + 1;
    }
    function codeText(inner) {
      const source = String(inner).replace(/<br\b[^<>]*>/gi, "\n");
      const parts = [];
      let piece = "";
      let opened = 0;
      let i = 0;
      while (i < source.length) {
        const ch = source[i];
        if (ch !== "<") {
          piece += ch;
          i++;
          continue;
        }
        if (source.startsWith("<!", i) || source.startsWith("<?", i)) {
          const decl = scanDeclaration(source, i);
          if (typeof decl === "number") {
            i = decl;
            continue;
          }
          piece += source.slice(decl.from, decl.end);
          i = decl.end >= source.length ? decl.end : decl.end + 3;
          continue;
        }
        if (!opensTag(source, i)) {
          piece += ch;
          i++;
          continue;
        }
        const tag = scanTag(source, i);
        if (tag !== null && tag.notATag) {
          piece += ch;
          i++;
          continue;
        }
        if (tag === null) {
          const gt = source.indexOf(">", i);
          if (gt === -1) {
            piece += ch;
            i++;
            continue;
          }
          i = gt + 1;
          continue;
        }
        if (tag.closing) {
          if (closesWrapper(tag, opened)) {
            opened--;
            const tail = /^[ \t]*\n/.exec(source.slice(tag.end));
            if (tail) {
              let end = piece.length;
              while (end > 0 && (piece[end - 1] === " " || piece[end - 1] === "	")) end--;
              piece = piece.slice(0, end);
              if (piece) {
                parts.push(piece);
                piece = "";
              }
              parts.push("\n");
              i = tag.end + tail[0].length;
              continue;
            }
          }
          i = tag.end;
          continue;
        }
        if (!opensMarkup(tag)) {
          piece += ch;
          i++;
          continue;
        }
        opened++;
        i = tag.end;
      }
      if (piece) parts.push(piece);
      return decodeEntities(parts.join("")).replace(/^\n+|\s+$/g, "");
    }
    function squeeze(input) {
      return String(input).replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n");
    }
    function collapse(input) {
      return squeeze(input).trim();
    }
    function cleanText(input) {
      return collapse(decodeEntities(stripTags(input)).replace(/\n/g, " "));
    }
    function resolveMaxBlocks(maxBlocks) {
      const n = typeof maxBlocks === "number" ? maxBlocks : Number(maxBlocks);
      if (!Number.isFinite(n) || n <= 0) return BLOCK_CEILING;
      return Math.min(BLOCK_CEILING, Math.floor(n));
    }
    function emptyResult() {
      return { title: "", blocks: [], truncated: false, headingMiss: false, missName: "", error: "" };
    }
    function errorResult(message) {
      const result = emptyResult();
      result.error = message;
      return result;
    }
    function impliedClose(stack, newTag, closeFrame) {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.tag === "p") {
          closeFrame("p");
          continue;
        }
        if (top.tag === "li" && newTag === "li") {
          closeFrame("li");
          continue;
        }
        if (HEADING_TAG.test(top.tag) && HEADING_TAG.test(newTag)) {
          closeFrame(top.tag);
          continue;
        }
        break;
      }
    }
    function partsToText(parts) {
      let out = "";
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
    function codeLang(attrs) {
      const a = attrs || "";
      const hay = attrValue(a, "class") || "";
      let name = "";
      const patterns = [
        /(?:^|\s)(?:language|lang)-([A-Za-z0-9+#._-]+)/,
        /(?:^|\s)highlight-([A-Za-z0-9+#._-]+)/,
        /brush:\s*([A-Za-z0-9+#._-]+)/
      ];
      for (const re of patterns) {
        const m = re.exec(hay) || re.exec(a);
        if (m) {
          name = m[1];
          break;
        }
      }
      if (!name) {
        name = attrValue(a, "data-lang") || attrValue(a, "data-language") || "";
      }
      if (!name) return "";
      name = name.toLowerCase();
      const trimmed = name.replace(/\d+$/, "");
      return PRISM_ALIAS[trimmed] || PRISM_ALIAS[name] || trimmed;
    }
    var PRISM_ALIAS = {
      js: "javascript",
      ts: "typescript",
      py: "python",
      sh: "bash",
      shell: "bash",
      console: "bash",
      csharp: "csharp",
      "c#": "csharp",
      cpp: "cpp",
      "c++": "cpp",
      html: "markup",
      xml: "markup",
      svg: "markup",
      yml: "yaml",
      md: "markdown",
      golang: "go",
      rb: "ruby",
      rs: "rust"
    };
    var WRAPPER_TAGS = /* @__PURE__ */ new Set(["div", "figure", "section", "table"]);
    function innerCodeLang(inner) {
      let i = 0;
      while (i < inner.length) {
        const lt = inner.indexOf("<", i);
        if (lt === -1) return "";
        i = lt + 1;
        if (!opensTag(inner, lt)) continue;
        const tag = scanTag(inner, lt);
        if (tag === null || tag.notATag || tag.closing) continue;
        const lang = codeLang(tag.rest);
        if (lang) return lang;
        i = tag.end;
      }
      return "";
    }
    function wrapperLang(src, from, window2) {
      const floor = Math.max(0, from - (window2 == null ? 400 : window2));
      const depth = /* @__PURE__ */ new Map();
      let i = from;
      for (; ; ) {
        if (i <= 0) return "";
        const lt = src.lastIndexOf("<", i - 1);
        if (lt === -1 || lt < floor) return "";
        i = lt;
        if (!opensTag(src, lt)) continue;
        const tag = scanTag(src, lt);
        if (tag === null || tag.notATag) continue;
        const name = tag.name.toLowerCase();
        if (!WRAPPER_TAGS.has(name)) continue;
        const d = depth.get(name) || 0;
        if (tag.closing) {
          depth.set(name, d + 1);
          continue;
        }
        if (d > 0) {
          depth.set(name, d - 1);
          continue;
        }
        const lang = codeLang(tag.rest);
        if (lang) return lang;
      }
    }
    function headingId(attrs) {
      return attrValue(attrs || "", "id") || "";
    }
    function walkBlocks(src) {
      const blocks = [];
      const stack = [];
      let pending = [];
      let pendingBreak = false;
      const tailSpace = /* @__PURE__ */ new WeakMap();
      const openEls = [];
      const idAt = [];
      const clean = (str, isCode) => {
        const decoded = decodeEntities(str);
        return isCode ? decoded : squeeze(decoded);
      };
      const push = (type, parts, level, lang, id) => {
        const list = typeof parts === "string" ? [{ text: parts, code: type === "pre" }] : parts;
        const cleaned = [];
        for (const part of list) {
          const text2 = clean(part.text, part.code);
          if (text2) cleaned.push({ text: text2, code: part.code });
        }
        if (cleaned.length) {
          cleaned[0].text = cleaned[0].text.replace(/^\s+/, "");
          const last = cleaned[cleaned.length - 1];
          last.text = last.text.replace(/\s+$/, "");
        }
        const text = partsToText(cleaned);
        if (!text.trim()) return;
        const block = { type };
        if (level !== void 0) block.level = level;
        block.text = text;
        if (lang) block.lang = lang;
        if (id) block.id = id;
        if (typeof parts !== "string" && cleaned.some((p) => p.code)) block.parts = cleaned;
        blocks.push(block);
      };
      const takeBreak = (parts, chunk, isCode) => {
        if (!pendingBreak) return;
        pendingBreak = false;
        if (!parts.length) return;
        if (/^\s/.test(chunk)) return;
        if (tailSpace.get(parts)) return;
        if (CLOSING_PUNCT.test(chunk)) return;
        const last = parts[parts.length - 1];
        appendPart(parts, " ", last.code && isCode);
      };
      const write = (chunk, isCode) => {
        const parts = stack.length ? stack[stack.length - 1].parts : pending;
        takeBreak(parts, chunk, isCode);
        appendPart(parts, chunk, isCode);
        tailSpace.set(parts, /\s$/.test(chunk));
      };
      const appendText = (chunk) => {
        if (chunk) write(chunk, false);
      };
      const appendCode = (chunk) => {
        if (chunk) write(chunk, true);
      };
      let codeDepth = 0;
      const endInlineCode = () => {
        codeDepth = 0;
      };
      const appendSource = (chunk) => {
        const text = chunk.replace(/\n/g, " ");
        if (codeDepth > 0) appendCode(text);
        else appendText(text);
      };
      const emitFrame = (frame) => {
        push(frame.type, frame.parts, frame.level, void 0, frame.id);
      };
      const releaseFrames = () => {
        for (const frame of stack) {
          if (!frame.parts.length) continue;
          push(frame.type, frame.parts, frame.level, void 0, frame.id);
          frame.parts = [];
        }
      };
      const boundary = () => {
        endInlineCode();
        flushPending();
        releaseFrames();
      };
      const flushPending = () => {
        if (!pending.length) return;
        const parts = pending;
        pending = [];
        const last = parts[parts.length - 1];
        if (last && !last.code) last.text = last.text.replace(/\s+$/, "");
        const first = parts[0];
        if (first && !first.code) first.text = first.text.replace(/^\s+/, "");
        push("p", parts);
      };
      const popTo = (index) => {
        openEls.length = index;
        idAt.length = index;
      };
      const closeFrame = (tag) => {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag !== tag) continue;
          endInlineCode();
          const frames = stack.splice(i);
          for (const frame of frames) emitFrame(frame);
          return;
        }
      };
      const closeExplicitEl = (tag) => {
        for (let i = openEls.length - 1; i >= 0; i--) {
          if (openEls[i].tag === tag) {
            popTo(i);
            return;
          }
        }
      };
      const impliedCloseEls = (tag) => {
        if (BLOCK_LEVEL.has(tag)) {
          for (let i = openEls.length - 1; i >= 0; i--) {
            const t2 = openEls[i].tag;
            if (t2 === "p") {
              popTo(i);
              break;
            }
            if (!INLINE_LEVEL.has(t2)) break;
          }
        }
        const rule = IMPLIED_CLOSE.get(tag);
        if (!rule) return;
        for (; ; ) {
          let found = -1;
          for (let i = openEls.length - 1; i >= 0; i--) {
            const t2 = openEls[i].tag;
            if (rule.ends.indexOf(t2) >= 0) {
              found = i;
              break;
            }
            if (rule.scope.indexOf(t2) >= 0) break;
          }
          if (found < 0) break;
          popTo(found);
        }
      };
      const noteContainerId = (tag, attrs, closing) => {
        if (closing) {
          closeExplicitEl(tag);
          return;
        }
        if (VOID_TAGS.has(tag)) return;
        impliedCloseEls(tag);
        const id = headingId(attrs);
        openEls.push({ tag, id });
        idAt.push(id || (idAt.length ? idAt[idAt.length - 1] : ""));
      };
      const enclosingId = () => openEls.length ? idAt[openEls.length - 1] : "";
      const pushFrame = (type, tag, level, id) => {
        boundary();
        impliedClose(stack, tag, closeFrame);
        stack.push({ tag, type, level, id: typeof id === "function" ? id() : id, parts: [] });
      };
      const re = /<\/?([a-zA-Z][a-zA-Z0-9:_-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
      let lastIndex = 0;
      let match;
      while ((match = re.exec(src)) !== null) {
        const raw = match[0];
        const tag = match[1].toLowerCase();
        const attrs = match[2] || "";
        const closing = raw.charAt(1) === "/";
        const selfClosing = /\/\s*>$/.test(raw.replace(/"[^"]*"|'[^']*'/g, ""));
        if (match.index > lastIndex) appendSource(src.slice(lastIndex, match.index));
        if (BLOCK_TAGS.has(tag)) pendingBreak = true;
        if (tag === "br") {
          appendText("\n");
          lastIndex = re.lastIndex;
          continue;
        }
        if (tag === "pre" && !closing) {
          const closer = /<\/pre\s*>/gi;
          closer.lastIndex = re.lastIndex;
          const close = closer.exec(src);
          const inner = src.slice(re.lastIndex, close ? close.index : src.length);
          let lang = codeLang(attrs) || innerCodeLang(inner);
          if (!lang) lang = wrapperLang(src, match.index);
          const text = codeText(inner);
          if (stack.length) {
            appendCode(text);
          } else {
            boundary();
            push("pre", text, void 0, lang);
          }
          re.lastIndex = close ? closer.lastIndex : src.length;
          lastIndex = re.lastIndex;
          pendingBreak = true;
          continue;
        }
        lastIndex = re.lastIndex;
        if (selfClosing) continue;
        const noteId = () => noteContainerId(tag, attrs, closing);
        if (closing) noteId();
        if (tag === "code") {
          if (!closing) noteId();
          codeDepth = closing ? Math.max(0, codeDepth - 1) : codeDepth + 1;
          continue;
        }
        const heading = HEADING_TAG.exec(tag);
        if (heading) {
          if (closing) closeFrame(tag);
          else {
            impliedCloseEls(tag);
            const own = headingId(attrs);
            pushFrame("h", tag, Number(heading[1]), own || enclosingId);
          }
          continue;
        }
        const type = EMITTING_TAGS[tag];
        if (type) {
          if (closing) closeFrame(tag);
          else pushFrame(type, tag);
          if (!closing) noteId();
          continue;
        }
        if (!closing) noteId();
      }
      if (lastIndex < src.length) appendSource(src.slice(lastIndex));
      for (const frame of stack.splice(0)) emitFrame(frame);
      flushPending();
      return blocks;
    }
    var BODY_IDS = /* @__PURE__ */ new Set(["content", "main", "main-content", "primary"]);
    var ATTR_TAG_NAME = /^[a-z]+\b/i;
    var BODY_OPENERS = [
      (tag) => /^main\b/i.test(tag.name),
      (tag) => /^article\b/i.test(tag.name),
      (tag) => ATTR_TAG_NAME.test(tag.name) && (attrValue(tag.rest, "role") || "").toLowerCase() === "main",
      (tag) => ATTR_TAG_NAME.test(tag.name) && BODY_IDS.has((attrValue(tag.rest, "id") || "").toLowerCase())
    ];
    function attrValue(rest, name) {
      let k = 0;
      while (k < rest.length) {
        while (k < rest.length && /[\s/]/.test(rest[k])) k++;
        const start = k;
        while (k < rest.length && !/[\s=/>]/.test(rest[k])) k++;
        const attr = rest.slice(start, k);
        let eq = k;
        while (eq < rest.length && /\s/.test(rest[eq])) eq++;
        if (rest[eq] !== "=") {
          k = k + 1;
          continue;
        }
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
        const valueStart = k;
        while (k < rest.length && !/[\s]/.test(rest[k])) k++;
        if (attr.toLowerCase() === name) return rest.slice(valueStart, k);
      }
      return null;
    }
    function scanOpenTag(text, i) {
      let k = i + 1;
      const closing = text[k] === "/";
      if (closing) k++;
      const start = k;
      while (k < text.length && /[A-Za-z0-9:_-]/.test(text[k])) k++;
      const name = text.slice(start, k);
      if (!/[A-Za-z]/.test(name.charAt(0))) return null;
      const next = text[k];
      if (!(next === ">" || next === "/" || isTagBoundary(next))) return null;
      while (k < text.length && text[k] !== ">") {
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
    function findBodyOpen(src, matches) {
      let i = 0;
      while (i < src.length) {
        const lt = src.indexOf("<", i);
        if (lt === -1) return null;
        if (!opensTag(src, lt)) {
          i = lt + 1;
          continue;
        }
        const tag = scanOpenTag(src, lt);
        if (tag === null) {
          i = lt + 1;
          continue;
        }
        if (!tag.closing && matches(tag)) return tag;
        i = tag.end;
      }
      return null;
    }
    function matchingCloserAt(src, from, name) {
      let depth = 1;
      let i = from;
      while (i < src.length) {
        const lt = src.indexOf("<", i);
        if (lt === -1) return -1;
        if (!opensTag(src, lt)) {
          i = lt + 1;
          continue;
        }
        const tag = scanOpenTag(src, lt);
        if (tag === null) {
          i = lt + 1;
          continue;
        }
        if (tag.name.toLowerCase() === name) {
          if (tag.closing && !/^\s*$/.test(tag.rest)) {
            i = tag.end;
            continue;
          }
          depth += tag.closing ? -1 : 1;
          if (depth === 0) return lt;
        }
        i = tag.end;
      }
      return -1;
    }
    function articleBody(src) {
      for (const opener of BODY_OPENERS) {
        const open = findBodyOpen(src, opener);
        if (!open) continue;
        const from = open.end;
        const closeAt = matchingCloserAt(src, from, open.name.toLowerCase());
        if (closeAt === -1) continue;
        const body = src.slice(from, closeAt);
        if (body.trim()) return body;
      }
      return src;
    }
    function extract(html, heading, maxBlocks) {
      const result = emptyResult();
      const limit = resolveMaxBlocks(maxBlocks);
      let src;
      try {
        src = html === void 0 || html === null ? "" : String(html);
        src = src.replace(/\r\n?/g, "\n");
        src = src.replace(/<!doctype\b[^>]*>/gi, " ");
        src = src.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ").replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
        const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(src);
        if (title) result.title = cleanText(title[1]);
        src = src.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ");
        src = src.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, " ");
        src = articleBody(src);
        let blocks = walkBlocks(src);
        const picked = selectBlocks(blocks, heading);
        if (picked.miss) {
          result.headingMiss = true;
          result.missName = picked.miss;
          result.blocks = [];
          return result;
        }
        blocks = picked.blocks;
        if (blocks.length > limit) {
          blocks = blocks.slice(0, limit);
          result.truncated = true;
        }
        result.blocks = blocks;
      } catch (err) {
        result.error = "Failed to parse HTML: " + (err && err.message || String(err));
        result.blocks = [];
      }
      return result;
    }
    function lookupHeader(headers, name) {
      if (!headers) return "";
      const wanted = name.toLowerCase();
      if (typeof headers.get === "function") {
        const value = headers.get(name);
        return value === void 0 || value === null ? "" : String(value);
      }
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === wanted) {
          const value = headers[key];
          return value === void 0 || value === null ? "" : String(value);
        }
      }
      return "";
    }
    var MARKUP_TEXT_SUBTYPES = /* @__PURE__ */ new Set(["html", "xhtml"]);
    function isMarkupContentType(contentType) {
      if (!contentType) return true;
      const match = /^\s*([a-z0-9.+-]+)\/([a-z0-9.+-]+)/i.exec(contentType);
      if (!match) return true;
      const type = match[1].toLowerCase();
      const subtype = match[2].toLowerCase();
      if (type === "text") return MARKUP_TEXT_SUBTYPES.has(subtype);
      if (type === "application" && (subtype === "xml" || subtype === "xhtml+xml")) return true;
      if (type === "application" && /\+xml$/.test(subtype)) return true;
      return false;
    }
    function textBlock(body) {
      const text = body.replace(/\s+$/, "");
      if (!text.trim()) return null;
      return { type: "pre", text };
    }
    function textBodyResult(text, maxBlocks) {
      const result = emptyResult();
      const limit = resolveMaxBlocks(maxBlocks);
      const lines = String(text === void 0 || text === null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
      if (lines.length > limit) {
        result.truncated = true;
        result.blocks = [textBlock(lines.slice(0, limit).join("\n"))].filter(Boolean);
      } else {
        result.blocks = [textBlock(lines.join("\n"))].filter(Boolean);
      }
      return result;
    }
    async function fetchSection(url, heading, maxBlocks) {
      let requestUrl;
      try {
        ({ requestUrl } = require("obsidian"));
      } catch (err) {
        return errorResult("obsidian module unavailable: " + (err && err.message || String(err)));
      }
      if (typeof requestUrl !== "function") return errorResult("requestUrl is unavailable");
      let response;
      try {
        response = await requestUrl({ url, throw: false });
      } catch (err) {
        return errorResult(err && err.message || String(err));
      }
      const status = response && typeof response.status === "number" ? response.status : null;
      if (status === null) return errorResult("HTTP status unknown");
      if (status < 200 || status >= 300) return errorResult("HTTP " + status);
      const body = response && typeof response.text === "string" ? response.text : "";
      const contentType = lookupHeader(response && response.headers, "content-type");
      if (!isMarkupContentType(contentType)) return textBodyResult(body, maxBlocks);
      return extract(body, heading, maxBlocks);
    }
    module2.exports = { extract, fetchSection };
  }
});

// src/render.js
var require_render = __commonJS({
  "src/render.js"(exports2, module2) {
    "use strict";
    var { PRISM_MAX_LINES } = require_code();
    var prismPromise = null;
    function ensurePrism() {
      if (!prismPromise) {
        let failed = false;
        prismPromise = (async () => {
          try {
            const { loadPrism } = require("obsidian");
            return await loadPrism();
          } catch (e) {
            failed = true;
            return null;
          }
        })().then((P) => {
          if (failed) prismPromise = null;
          return P;
        });
      }
      return prismPromise;
    }
    function renderTokens(parent, tokens) {
      for (const tok of tokens) {
        if (tok == null) continue;
        if (typeof tok === "string") {
          parent.appendText(tok);
          continue;
        }
        const alias = Array.isArray(tok.alias) ? tok.alias.join(" ") : tok.alias || "";
        const span = parent.createSpan({ cls: ("token " + tok.type + " " + alias).trim() });
        if (typeof tok.content === "string") span.setText(tok.content);
        else if (tok.content != null) renderTokens(span, Array.isArray(tok.content) ? tok.content : [tok.content]);
      }
    }
    function grammarFor(P, prismId) {
      if (!P || !P.languages) return null;
      if (!prismId) return null;
      return P.languages[prismId] || null;
    }
    async function renderCode(parent, text, prismId) {
      const P = text.split("\n").length <= PRISM_MAX_LINES ? await ensurePrism() : null;
      const grammar = grammarFor(P, prismId);
      const pre = parent.createEl("pre", { cls: "cp-code" });
      const code = pre.createEl("code");
      if (grammar) renderTokens(code, P.tokenize(text, grammar));
      else code.setText(text);
      return pre;
    }
    async function renderBlock(parent, block) {
      const type = block && block.type;
      if (type === "h") {
        const level = Math.min(6, Math.max(1, block.level || 2));
        parent.createEl("h" + level, { cls: "cp-h", text: block.text });
        return;
      }
      if (type === "pre") {
        return renderCode(parent, block.text, block.lang || "").then((pre) => pre.addClass("cp-web-pre"));
      }
      if (type === "li") {
        const row = parent.createEl("div", { cls: "cp-li" });
        row.createSpan({ cls: "cp-li-bullet", text: "\u2022" });
        appendText(row, block);
        return;
      }
      if (type === "quote") {
        const quote = parent.createEl("blockquote", { cls: "cp-quote" });
        appendText(quote, block);
        return;
      }
      const para = parent.createEl("p", { cls: "cp-p" });
      appendText(para, block);
    }
    function appendText(parent, block) {
      const parts = block && block.parts;
      if (!parts || !parts.length) {
        parent.appendText(block.text || "");
        return;
      }
      for (const part of parts) {
        if (!part.text) continue;
        if (part.code) parent.createEl("code", { cls: "cp-inline-code", text: part.text });
        else parent.appendText(part.text);
      }
    }
    async function renderBlocks(parent, blocks) {
      let n = 0;
      for (const block of blocks || []) {
        if (!block || !block.text) continue;
        await renderBlock(parent, block);
        n++;
      }
      return n;
    }
    module2.exports = { renderCode, renderBlocks, ensurePrism };
  }
});

// src/popover.js
var require_popover = __commonJS({
  "src/popover.js"(exports2, module2) {
    "use strict";
    var SHOW_DELAY = 200;
    var HIDE_GRACE = 250;
    var EDGE_PAD = 12;
    var Popover = class {
      constructor(opts) {
        const o = opts || {};
        this.cls = o.cls || "cp-popover";
        this.hiddenCls = o.hiddenCls || "cp-hidden";
        this.showDelay = o.showDelay == null ? SHOW_DELAY : o.showDelay;
        this.hideGrace = o.hideGrace == null ? HIDE_GRACE : o.hideGrace;
        this.el = null;
        this.timer = null;
        this.hideTimer = null;
        this.key = "";
        this.pending = null;
        this.token = 0;
      }
      ensureEl() {
        if (!this.el) {
          this.el = document.body.createDiv({ cls: this.cls + " " + this.hiddenCls });
          this.el.addEventListener("mouseenter", () => this.cancelHide());
          this.el.addEventListener("mouseleave", () => this.leave());
        }
        return this.el;
      }
      isVisible() {
        return !!this.el && !this.el.classList.contains(this.hiddenCls);
      }
      contains(node) {
        return !!this.el && !!node && this.el.contains(node);
      }
      cancelHide() {
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
      }
      // Whether a preview is on its way but not yet on screen. `isVisible()` cannot answer
      // this: during the show delay the element does not exist at all.
      isPending() {
        return !!this.pending;
      }
      // Withdraw a preview that has not appeared yet. Clearing the timer is the essential
      // half — the pending record follows it, so the next hover starts from scratch.
      cancelPending() {
        clearTimeout(this.timer);
        this.timer = null;
        this.pending = null;
      }
      // Re-asking for what is already up, or already on its way, changes nothing — otherwise
      // every mouse move across the same link would restart the timer.
      schedule(key, x, y, build) {
        this.cancelHide();
        if (key === this.key && this.isVisible()) return;
        if (this.pending && this.pending.key === key) return;
        this.cancelPending();
        this.pending = { key, x, y, build };
        this.timer = setTimeout(() => {
          const p = this.pending;
          this.timer = null;
          this.pending = null;
          if (p) this.show(p.key, p.x, p.y, p.build);
        }, this.showDelay);
      }
      // The pointer left. Both halves matter: a preview already up gets its grace period, and
      // a preview still waiting for its delay is dropped outright — otherwise the panel would
      // appear after the pointer had gone, and the grace period (longer than the delay) would
      // not take it back off the screen until it had already been seen.
      leave() {
        this.cancelPending();
        if (this.hideTimer) return;
        this.hideTimer = setTimeout(() => {
          this.hideTimer = null;
          this.hide();
        }, this.hideGrace);
      }
      async show(key, x, y, build) {
        const token = ++this.token;
        const ctx = { isCurrent: () => token === this.token };
        const el = this.ensureEl();
        el.empty();
        let after;
        try {
          after = await build(el, ctx);
        } catch (e) {
          after = false;
        }
        if (after === false || !ctx.isCurrent()) {
          if (ctx.isCurrent()) {
            this.key = "";
            el.addClass(this.hiddenCls);
            el.empty();
          }
          return;
        }
        this.key = key;
        el.style.visibility = "hidden";
        el.style.left = "-9999px";
        el.style.top = "0px";
        el.removeClass(this.hiddenCls);
        if (typeof after === "function") after();
        const r = el.getBoundingClientRect();
        let left = x + EDGE_PAD;
        let top = y + EDGE_PAD;
        if (left + r.width > window.innerWidth - EDGE_PAD) {
          left = Math.max(EDGE_PAD, x - EDGE_PAD - r.width);
        }
        if (top + r.height > window.innerHeight - EDGE_PAD) {
          top = Math.max(EDGE_PAD, y - EDGE_PAD - r.height);
        }
        el.style.left = left + "px";
        el.style.top = top + "px";
        el.style.visibility = "visible";
      }
      hide() {
        this.cancelPending();
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
        this.key = "";
        this.token++;
        if (this.el) {
          this.el.addClass(this.hiddenCls);
          this.el.empty();
        }
      }
      destroy() {
        this.cancelPending();
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
        this.token++;
        if (this.el) {
          this.el.remove();
          this.el = null;
        }
      }
    };
    module2.exports = { Popover, SHOW_DELAY, HIDE_GRACE };
  }
});

// src/locales/en.js
var require_en = __commonJS({
  "src/locales/en.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      // The command and its notice.
      "cmd.toggle": "Toggle hover preview",
      "notice.on": "Hover preview on",
      "notice.off": "Hover preview off",
      // The preview panel.
      "preview.error.fetch": "Could not fetch: {error}",
      "preview.error.noPath": "No path to read",
      "preview.error.nothingAtLine": "Nothing to show at line {line} \u2014 the file is missing, shorter, or not readable.",
      "preview.error.load": "Could not load: {error}",
      "preview.note.headingMiss": "This page has no heading \u201C{heading}\u201D.",
      "preview.note.empty": "Nothing readable on that page.",
      "preview.note.truncated": { one: "Showing the first block.", other: "Showing the first {n} blocks." },
      "preview.note.truncatedLines": { one: "Showing the first line.", other: "Showing the first {n} lines." },
      // Settings.
      "settings.enabled.name": "Preview on hover",
      "settings.enabled.desc": "Rest the pointer on a link to preview what it points at.",
      "settings.modifier.name": "Show preview while holding",
      "settings.modifier.desc": "The key a hover waits for. Ctrl matches Obsidian's own page preview. Choose a plain hover to preview without pressing anything.",
      "settings.modifier.ctrl": "Ctrl",
      "settings.modifier.shift": "Shift",
      "settings.modifier.alt": "Alt",
      "settings.modifier.none": "A plain hover",
      "settings.modifier.custom": "Custom\u2026",
      "settings.modifier.customDesc": "Which keys, together, a hover waits for.",
      "settings.modifier.customEmptyHint": "Every key is switched off, so the preview waits for Ctrl (the default) \u2014 switch one on, or choose a plain hover.",
      "settings.modifier.noneHint": "A preview now appears as soon as the pointer rests on a link.",
      // The syntax crib in the settings pane.
      "settings.help.code": "Link a line, or a range of lines, of a source file:",
      "settings.help.repo": "A file in a repository works the same way:",
      "settings.help.web": "A web page shows its whole body. A heading after # narrows it, and a dash says how much of the page to take:",
      "settings.help.webForms": "page#install  that heading and what is under it \xB7 page#-#install  the page up to that heading \xB7 page#install-usage  from one heading up to the next \xB7 page#install-  that heading to the end",
      "settings.help.note": "A code link must name a line (#L18). GitHub and GitLab blob links are read as code; any other web link is read as a page."
    };
  }
});

// src/locales/zh.js
var require_zh = __commonJS({
  "src/locales/zh.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      // 命令与提示
      "cmd.toggle": "\u5207\u6362\u60AC\u505C\u9884\u89C8",
      "notice.on": "\u60AC\u505C\u9884\u89C8\u5DF2\u5F00\u542F",
      "notice.off": "\u60AC\u505C\u9884\u89C8\u5DF2\u5173\u95ED",
      // 预览面板
      "preview.error.fetch": "\u83B7\u53D6\u5931\u8D25\uFF1A{error}",
      "preview.error.noPath": "\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u8DEF\u5F84",
      "preview.error.nothingAtLine": "\u7B2C {line} \u884C\u6CA1\u6709\u53EF\u663E\u793A\u7684\u5185\u5BB9 \u2014\u2014 \u6587\u4EF6\u4E0D\u5B58\u5728\u3001\u884C\u6570\u4E0D\u8DB3\u6216\u65E0\u6CD5\u8BFB\u53D6\u3002",
      "preview.error.load": "\u52A0\u8F7D\u5931\u8D25\uFF1A{error}",
      "preview.note.headingMiss": "\u8BE5\u9875\u9762\u6CA1\u6709\u300C{heading}\u300D\u8FD9\u4E2A\u6807\u9898\u3002",
      "preview.note.empty": "\u8BE5\u9875\u9762\u6CA1\u6709\u53EF\u8BFB\u5185\u5BB9\u3002",
      "preview.note.truncated": { other: "\u53EA\u663E\u793A\u524D {n} \u4E2A\u5185\u5BB9\u5757\u3002" },
      "preview.note.truncatedLines": { other: "\u53EA\u663E\u793A\u524D {n} \u884C\u3002" },
      // 设置
      "settings.enabled.name": "\u60AC\u505C\u65F6\u9884\u89C8",
      "settings.enabled.desc": "\u628A\u6307\u9488\u505C\u5728\u94FE\u63A5\u4E0A\uFF0C\u9884\u89C8\u5B83\u6307\u5411\u7684\u5185\u5BB9\u3002",
      "settings.modifier.name": "\u6309\u4F4F\u65F6\u663E\u793A\u9884\u89C8",
      "settings.modifier.desc": "\u60AC\u505C\u65F6\u9700\u6309\u4F4F\u7684\u952E\u3002Ctrl \u4E0E Obsidian \u81EA\u5E26\u7684\u60AC\u6D6E\u9884\u89C8\u4E00\u81F4\u3002\u9009\u62E9\u300C\u53EA\u9700\u60AC\u505C\u300D\u5219\u4E0D\u5FC5\u6309\u952E\u3002",
      "settings.modifier.ctrl": "Ctrl",
      "settings.modifier.shift": "Shift",
      "settings.modifier.alt": "Alt",
      "settings.modifier.none": "\u53EA\u9700\u60AC\u505C",
      "settings.modifier.custom": "\u81EA\u5B9A\u4E49\u2026",
      "settings.modifier.customDesc": "\u9700\u8981\u540C\u65F6\u6309\u4F4F\u7684\u6309\u952E\u7EC4\u5408\u3002",
      "settings.modifier.customEmptyHint": "\u4E09\u4E2A\u952E\u90FD\u672A\u6253\u5F00\uFF0C\u9884\u89C8\u5C06\u7B49\u5F85 Ctrl\uFF08\u9ED8\u8BA4\u952E\uFF09\u2014\u2014\u8BF7\u6253\u5F00\u5176\u4E2D\u4E00\u4E2A\uFF0C\u6216\u6539\u9009\u300C\u53EA\u9700\u60AC\u505C\u300D\u3002",
      "settings.modifier.noneHint": "\u73B0\u5728\u6307\u9488\u505C\u5728\u94FE\u63A5\u4E0A\u5C31\u4F1A\u76F4\u63A5\u663E\u793A\u9884\u89C8\u3002",
      // 设置页里的语法说明
      "settings.help.code": "\u94FE\u63A5\u6E90\u4EE3\u7801\u7684\u67D0\u4E00\u884C\uFF0C\u6216\u67D0\u51E0\u884C\uFF1A",
      "settings.help.repo": "\u4ED3\u5E93\u91CC\u7684\u6587\u4EF6\u540C\u7406\uFF1A",
      "settings.help.web": "\u7F51\u9875\u94FE\u63A5\u9ED8\u8BA4\u663E\u793A\u6574\u4E2A\u6B63\u6587\u3002# \u4E4B\u540E\u5199\u6807\u9898\u53EF\u7F29\u5C0F\u8303\u56F4\uFF0C\u8FDE\u5B57\u7B26\u51B3\u5B9A\u53D6\u54EA\u4E00\u6BB5\uFF1A",
      "settings.help.webForms": "page#install  \u8BE5\u6807\u9898\u53CA\u5176\u4E0B\u5C5E\u5185\u5BB9 \xB7 page#-#install  \u4ECE\u9875\u9996\u5230\u8BE5\u6807\u9898 \xB7 page#install-usage  \u4ECE\u6807\u98981\u5230\u6807\u98982\uFF08\u4E0D\u542B\u6807\u98982\uFF09 \xB7 page#install-  \u8BE5\u6807\u9898\u5230\u9875\u5C3E",
      "settings.help.note": "\u4EE3\u7801\u94FE\u63A5\u5FC5\u987B\u5E26\u884C\u53F7\uFF08#L18\uFF09\u3002GitHub \u4E0E GitLab \u7684 blob \u94FE\u63A5\u6309\u4EE3\u7801\u5904\u7406\uFF0C\u5176\u4F59\u7F51\u9875\u94FE\u63A5\u6309\u9875\u9762\u5904\u7406\u3002"
    };
  }
});

// src/i18n.js
var require_i18n = __commonJS({
  "src/i18n.js"(exports2, module2) {
    "use strict";
    var LOCALES = {
      en: require_en(),
      zh: require_zh()
    };
    var FALLBACK = "en";
    var language = FALLBACK;
    var dict = LOCALES[FALLBACK];
    var pluralRules = null;
    function resolveLanguage(tag) {
      const lower = String(tag || "").toLowerCase();
      if (!lower) return FALLBACK;
      if (LOCALES[lower]) return lower;
      const base = lower.split("-")[0];
      return LOCALES[base] ? base : FALLBACK;
    }
    function detectLanguage() {
      let tag = "";
      try {
        const { moment } = require("obsidian");
        if (moment && typeof moment.locale === "function") tag = String(moment.locale() || "");
      } catch (e) {
        tag = "";
      }
      return resolveLanguage(tag);
    }
    function initI18n2() {
      language = detectLanguage();
      dict = LOCALES[language] || LOCALES[FALLBACK];
      try {
        pluralRules = new Intl.PluralRules(language);
      } catch (e) {
        pluralRules = new Intl.PluralRules(FALLBACK);
      }
      return dict;
    }
    function interpolate(str, vars) {
      if (!vars) return String(str);
      return String(str).replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m);
    }
    function lookup(key) {
      const own = dict[key];
      if (own !== void 0) return own;
      return LOCALES[FALLBACK][key];
    }
    function t2(key, vars) {
      const entry = lookup(key);
      if (entry === void 0) return key;
      return interpolate(entry, vars);
    }
    function plural(key, n, vars) {
      const entry = lookup(key);
      if (entry === void 0) return key;
      if (typeof entry !== "object" || entry === null) return interpolate(entry, Object.assign({ n }, vars));
      const merged = Object.assign({ n }, vars);
      if (!pluralRules) return interpolate(entry.other != null ? entry.other : Object.values(entry)[0], merged);
      let category;
      try {
        category = pluralRules.select(n);
      } catch (e) {
        category = "other";
      }
      const tpl = entry[category] != null ? entry[category] : entry.other != null ? entry.other : Object.values(entry)[0];
      return interpolate(tpl, merged);
    }
    module2.exports = { initI18n: initI18n2, t: t2, plural, resolveLanguage, LOCALES };
  }
});

// src/preview.js
var require_preview = __commonJS({
  "src/preview.js"(exports2, module2) {
    "use strict";
    var { readWindow, sliceLines, langFor } = require_code();
    var { fetchText } = require_remote();
    var { fetchSection } = require_web();
    var { renderCode, renderBlocks } = require_render();
    var { Popover } = require_popover();
    var { t: t2, plural } = require_i18n();
    function urlIdentity(url) {
      const raw = String(url || "");
      const m = /^(https?:\/\/)([^/?#]*)([\s\S]*)$/i.exec(raw);
      if (!m) return raw;
      return m[1] + m[2].toLowerCase() + m[3].replace(/\/+$/, "");
    }
    function keyFor(target, sourcePath) {
      if (target.kind === "code") {
        return target.source === "remote" ? "r:" + target.rawUrl + ":" + target.from + "-" + target.to : "l:" + (sourcePath || "") + ":" + target.path + ":" + target.from + "-" + target.to;
      }
      return "w:" + urlIdentity(target.url) + ":" + (target.heading || "");
    }
    function labelFor(target) {
      if (target.kind === "code") {
        const path = target.source === "remote" && target.host ? target.host + " \xB7 " + target.path : target.path;
        const range = target.from === target.to ? ":" + target.from : ":" + target.from + "-" + target.to;
        return path + range;
      }
      const host = urlIdentity(target.url).replace(/^https?:\/\//, "");
      return target.heading ? host + "#" + target.heading : host;
    }
    var Preview2 = class {
      constructor(plugin) {
        this.plugin = plugin;
        this.pop = new Popover({ cls: "cp-hover", hiddenCls: "cp-hidden" });
      }
      isVisible() {
        return this.pop.isVisible();
      }
      contains(node) {
        return this.pop.contains(node);
      }
      cancelHide() {
        this.pop.cancelHide();
      }
      leave() {
        this.pop.leave();
      }
      hide() {
        this.pop.hide();
      }
      destroy() {
        this.pop.destroy();
      }
      // `sourcePath` is the note the link sits in, so a relative path resolves from the right
      // folder even when several notes are open — and keys as part of the link's identity, so
      // the same spelling in two notes is two previews, not one stale panel.
      schedule(target, sourcePath, x, y) {
        this.pop.schedule(keyFor(target, sourcePath), x, y, (el, ctx) => this.build(target, sourcePath, el, ctx));
      }
      async build(target, sourcePath, el, ctx) {
        el.createDiv({ cls: "cp-header", text: labelFor(target) });
        const body = el.createDiv({ cls: "cp-body" });
        if (target.kind === "code") return this.buildCode(target, sourcePath, body, ctx);
        return this.buildWeb(target, body, ctx);
      }
      async buildCode(target, sourcePath, body, ctx) {
        const from = target.from;
        const to = target.to;
        let window2;
        if (target.source === "remote") {
          const res = await fetchText(target.rawUrl);
          if (!res.ok) {
            body.createDiv({ cls: "cp-error", text: t2("preview.error.fetch", { error: res.error || "unknown error" }) });
            return true;
          }
          window2 = sliceLines(res.text, from, to);
        } else {
          const abs = this.plugin.resolvePath(sourcePath, target.path);
          if (!abs) {
            body.createDiv({ cls: "cp-error", text: t2("preview.error.noPath") });
            return true;
          }
          window2 = await readWindow(abs, from, to);
        }
        if (!window2) {
          body.createDiv({ cls: "cp-error", text: t2("preview.error.nothingAtLine", { line: target.from }) });
          return true;
        }
        if (!ctx.isCurrent()) return false;
        const first = Math.max(0, target.from - window2.startLine);
        const count = Math.max(1, Math.min(window2.lines.length - first, target.to - target.from + 1));
        const band = body.createDiv({ cls: "cp-band" });
        band.style.top = "calc(var(--cp-lh) * " + first + ")";
        band.style.height = "calc(var(--cp-lh) * " + count + ")";
        const text = window2.lines.join("\n");
        const lang = langFor(target.path);
        await renderCode(body, text, lang);
        if (!ctx.isCurrent()) return false;
        if (window2.truncated) {
          body.createDiv({ cls: "cp-note", text: plural("preview.note.truncatedLines", window2.lines.length) });
        }
        return () => {
          body.scrollTop = Math.max(0, band.offsetTop + band.offsetHeight / 2 - body.clientHeight / 2);
        };
      }
      async buildWeb(target, body, ctx) {
        const res = await fetchSection(target.url, target.heading);
        if (!ctx.isCurrent()) return false;
        if (res.error) {
          body.createDiv({ cls: "cp-error", text: t2("preview.error.load", { error: res.error }) });
          return true;
        }
        if (target.heading && res.headingMiss) {
          if (res.title) body.createDiv({ cls: "cp-page-title", text: res.title });
          body.createDiv({ cls: "cp-error", text: t2("preview.note.headingMiss", { heading: res.missName || target.heading }) });
          return true;
        }
        if (res.title) body.createDiv({ cls: "cp-page-title", text: res.title });
        const drawn = await renderBlocks(body, res.blocks);
        if (!drawn) body.createDiv({ cls: "cp-note", text: t2("preview.note.empty") });
        if (res.truncated) body.createDiv({ cls: "cp-note", text: plural("preview.note.truncated", drawn) });
        return true;
      }
    };
    module2.exports = { Preview: Preview2, keyFor, labelFor };
  }
});

// src/constants.js
var require_constants = __commonJS({
  "src/constants.js"(exports2, module2) {
    "use strict";
    var DEFAULT_SETTINGS2 = {
      enabled: true,
      // previews at all; the toggle command flips this
      // Which key a hover waits for: 'ctrl' | 'shift' | 'alt' | 'none' | 'custom'.
      // Ctrl by default, matching Obsidian's own page preview.
      hoverModifier: "ctrl",
      hoverModifiers: ["ctrl"]
      // what 'custom' means; a list of 'ctrl'/'shift'/'alt'
    };
    module2.exports = { DEFAULT_SETTINGS: DEFAULT_SETTINGS2 };
  }
});

// src/settings-tab.js
var require_settings_tab = __commonJS({
  "src/settings-tab.js"(exports2, module2) {
    "use strict";
    var { PluginSettingTab, Setting } = require("obsidian");
    var { t: t2 } = require_i18n();
    var HoverPreviewSettingTab2 = class extends PluginSettingTab {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl).setName(t2("settings.enabled.name")).setDesc(t2("settings.enabled.desc")).addToggle(
          (toggle) => toggle.setValue(!!this.plugin.settings.enabled).onChange(async (v) => {
            this.plugin.settings.enabled = v;
            await this.plugin.saveSettings();
            if (!v) this.plugin.preview.hide();
          })
        );
        new Setting(containerEl).setName(t2("settings.modifier.name")).setDesc(t2("settings.modifier.desc")).addDropdown((d) => {
          d.addOption("ctrl", t2("settings.modifier.ctrl"));
          d.addOption("shift", t2("settings.modifier.shift"));
          d.addOption("alt", t2("settings.modifier.alt"));
          d.addOption("none", t2("settings.modifier.none"));
          d.addOption("custom", t2("settings.modifier.custom"));
          d.setValue(this.plugin.settings.hoverModifier || "ctrl");
          d.onChange(async (v) => {
            this.plugin.settings.hoverModifier = v;
            await this.plugin.saveSettings();
            this.display();
          });
        });
        if (this.plugin.settings.hoverModifier === "custom") {
          new Setting(containerEl).setDesc(t2("settings.modifier.customDesc"));
          for (const key of ["ctrl", "shift", "alt"]) {
            const list = this.plugin.settings.hoverModifiers || [];
            new Setting(containerEl).setName(t2("settings.modifier." + key)).addToggle(
              (tg) => tg.setValue(list.includes(key)).onChange(async (on) => {
                const set = new Set(this.plugin.settings.hoverModifiers || []);
                if (on) set.add(key);
                else set.delete(key);
                this.plugin.settings.hoverModifiers = ["ctrl", "shift", "alt"].filter((k) => set.has(k));
                await this.plugin.saveSettings();
              })
            );
          }
          if (!(this.plugin.settings.hoverModifiers || []).some((k) => k === "ctrl" || k === "shift" || k === "alt")) {
            containerEl.createDiv({ cls: "cp-settings-note", text: t2("settings.modifier.customEmptyHint") });
          }
        }
        if (this.plugin.settings.hoverModifier === "none") {
          containerEl.createDiv({ cls: "cp-settings-note", text: t2("settings.modifier.noneHint") });
        }
        const help = containerEl.createDiv({ cls: "cp-settings-help" });
        help.createEl("p", { text: t2("settings.help.code") });
        help.createEl("pre", {
          text: "[the parser](../src/main.c#L18)\n[the loop](../src/main.c#L18-23)"
        });
        help.createEl("p", { text: t2("settings.help.repo") });
        help.createEl("pre", {
          text: "[upstream](https://github.com/owner/repo/blob/main/src/main.c#L18-L23)"
        });
        help.createEl("p", { text: t2("settings.help.web") });
        help.createEl("pre", {
          text: "[install](https://example.com/page#install)\n[intro](https://example.com/page#-#install)\n[install to usage](https://example.com/page#install-usage)\n[install onward](https://example.com/page#install-)"
        });
        help.createEl("p", { cls: "cp-settings-note", text: t2("settings.help.webForms") });
        help.createEl("p", { cls: "cp-settings-note", text: t2("settings.help.note") });
      }
    };
    module2.exports = { HoverPreviewSettingTab: HoverPreviewSettingTab2 };
  }
});

// src/pointer.js
var require_pointer = __commonJS({
  "src/pointer.js"(exports2, module2) {
    "use strict";
    var MIN_PAD = 2;
    function pointerOverBox(box, x, y) {
      if (!box) return false;
      const left = Math.min(box.left, box.right);
      const right = Math.max(box.left, box.right);
      const pad = Math.max(MIN_PAD, (right - left) / 2);
      const insideX = x >= left - pad && x <= right + pad;
      const insideY = y >= box.top && y <= box.bottom;
      return insideX && insideY;
    }
    function pointerOverPos2(cm, pos, evt) {
      let box;
      try {
        box = cm.coordsAtPos(pos);
      } catch (e) {
        return false;
      }
      return pointerOverBox(box, evt.clientX, evt.clientY);
    }
    module2.exports = { pointerOverPos: pointerOverPos2, pointerOverBox, MIN_PAD };
  }
});

// src/modifier.js
var require_modifier = __commonJS({
  "src/modifier.js"(exports2, module2) {
    "use strict";
    var MODES = ["ctrl", "shift", "alt", "none", "custom"];
    function heldModifiers(evt, isMac) {
      const held = [];
      if (evt.ctrlKey || isMac && evt.metaKey) held.push("ctrl");
      if (evt.shiftKey) held.push("shift");
      if (evt.altKey) held.push("alt");
      return held;
    }
    function requiredModifiers(mode, custom) {
      if (mode === "none") return [];
      if (mode === "custom") {
        const list = (Array.isArray(custom) ? custom : []).filter((m) => m === "ctrl" || m === "shift" || m === "alt");
        return list.length ? list : ["ctrl"];
      }
      return MODES.includes(mode) ? [mode] : ["ctrl"];
    }
    function needsKey2(surface) {
      return surface === "editor";
    }
    function shouldPreview2(evt, mode, custom, isMac) {
      const want = requiredModifiers(mode, custom);
      if (!want.length) return true;
      const held = heldModifiers(evt, isMac);
      if (held.length !== want.length) return false;
      return want.every((m) => held.includes(m));
    }
    module2.exports = { shouldPreview: shouldPreview2, requiredModifiers, heldModifiers, needsKey: needsKey2, MODES };
  }
});

// src/link-mark.js
var require_link_mark = __commonJS({
  "src/link-mark.js"(exports2, module2) {
    "use strict";
    function codeLinkFixes2(attrs) {
      const href = attrs && (attrs.href || attrs.dataHref) || "";
      if (!href) return null;
      return {
        add: ["external-link"],
        remove: ["internal-link", "is-unresolved"],
        // Anything that would make Obsidian offer a tooltip about following or opening a link.
        stripAttrs: ["aria-label", "data-tooltip-position", "data-tooltip-delay"]
      };
    }
    module2.exports = { codeLinkFixes: codeLinkFixes2 };
  }
});

// src/main.js
var { Plugin, MarkdownView, Notice, editorLivePreviewField } = require("obsidian");
var nodePath = require("path");
var { parseTarget, findTargets } = require_parse();
var { Preview } = require_preview();
var { resolveLocal } = require_code();
var { DEFAULT_SETTINGS } = require_constants();
var { HoverPreviewSettingTab } = require_settings_tab();
var { initI18n, t } = require_i18n();
var { pointerOverPos } = require_pointer();
var { shouldPreview, needsKey } = require_modifier();
var { codeLinkFixes } = require_link_mark();
var isModifierKey = (key) => key === "Control" || key === "Shift" || key === "Alt" || key === "Meta";
var HoverPreviewPlugin = class extends Plugin {
  async onload() {
    initI18n();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.preview = new Preview(this);
    this.registerDomEvent(document, "mousemove", (evt) => this.onPointerMove(evt));
    this.registerDomEvent(document, "mouseout", (evt) => this.onPointerOut(evt));
    this.registerDomEvent(document, "scroll", (evt) => {
      if (!this.preview.contains(evt.target)) this.preview.hide();
    }, { capture: true });
    this.registerDomEvent(window, "blur", () => this.preview.hide());
    this.registerDomEvent(document, "keydown", (evt) => {
      if (evt.key === "Escape") {
        this.preview.hide();
        return;
      }
      if (isModifierKey(evt.key)) this.onModifierChange(evt);
    }, { capture: true });
    this.registerDomEvent(document, "keyup", (evt) => {
      if (isModifierKey(evt.key)) this.onModifierChange(evt);
    }, { capture: true });
    this.registerDomEvent(document, "mousedown", (evt) => {
      if (!this.preview.contains(evt.target)) this.preview.hide();
    });
    this.registerMarkdownPostProcessor((el) => this.markCodeLinks(el));
    this.registerDomEvent(
      document,
      "mouseover",
      (evt) => {
        if (!evt.target || !evt.target.closest) return;
        const span = evt.target.closest(".cm-hmd-internal-link, .cm-link");
        if (!span) return;
        if (!this.pointerOnCodeLink(evt)) return;
        evt.stopPropagation();
        span.removeAttribute("aria-label");
        span.removeAttribute("data-tooltip-position");
        span.removeAttribute("data-tooltip-delay");
      },
      { capture: true }
    );
    this.addSettingTab(new HoverPreviewSettingTab(this.app, this));
    this.addCommand({
      id: "toggle-hover-preview",
      name: t("cmd.toggle"),
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
        if (!this.settings.enabled) this.preview.hide();
        new Notice(t(this.settings.enabled ? "notice.on" : "notice.off"));
      }
    });
  }
  onunload() {
    if (this.preview) this.preview.destroy();
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // The vault's folder on disk. `getBasePath` lives on the adapter, not on the vault —
  // calling it on the vault silently yields undefined, and every relative path then
  // resolves against the process's working directory instead of the notes.
  vaultPath() {
    const adapter = this.app && this.app.vault && this.app.vault.adapter;
    if (adapter && typeof adapter.getBasePath === "function") {
      return adapter.getBasePath();
    }
    return "";
  }
  // The absolute path a code link names, or null when it points outside the vault.
  //
  // The vault is the whole world here: `./src/main.rs` resolves from the note holding the
  // link, `/src/main.rs` from the vault root, and anything that climbs above the vault is
  // refused rather than read. Code outside the vault is linked as a repository URL, which
  // is a web link and goes through the fetch path instead.
  resolvePath(sourcePath, targetPath) {
    const vault = this.vaultPath();
    if (!vault) return null;
    const noteDir = sourcePath ? nodePath.join(vault, nodePath.dirname(sourcePath) === "." ? "" : nodePath.dirname(sourcePath)) : vault;
    return resolveLocal(targetPath, noteDir, vault);
  }
  // ---------------------------------------------------------------- pointer handling
  // The pointer moved. Whether that is enough to preview depends on the surface and on the
  // reader's setting, which `evaluate` decides.
  onPointerMove(evt) {
    if (!this.settings.enabled) return;
    if (this.preview.contains(evt.target)) {
      this.preview.cancelHide();
      return;
    }
    this.pointer = { x: evt.clientX, y: evt.clientY, target: evt.target };
    this.rememberModifiers(evt);
    this.evaluate(evt);
  }
  // Whether to show, hide, or keep waiting — the single place that decides.
  //
  // Two surfaces, two rules, and the difference is Obsidian's own: its page preview fires on
  // a plain hover in reading view and waits for the modifier in the editor. Matching that
  // means the key is never needed where the reader is only reading, and is needed exactly
  // where they are editing and a stray panel would be in the way.
  evaluate(evt) {
    const hit = this.hitAt(evt);
    if (!hit) {
      this.leavePreview();
      return;
    }
    if (needsKey(hit.surface) && !this.modifierHeld()) {
      this.leavePreview();
      return;
    }
    this.preview.cancelHide();
    this.preview.schedule(hit.target, hit.sourcePath, evt.clientX, evt.clientY);
  }
  // There is nothing to preview at the pointer, so let go of whatever is up or on its way.
  // Deliberately unconditional: while a preview waits out its show delay it is not visible
  // yet, and asking "is it visible?" before letting go is exactly how a preview used to
  // appear after the pointer had already left.
  leavePreview() {
    this.preview.leave();
  }
  // A modifier key went down or up. Only a press matters: it may complete a hover that the
  // pointer began on its own, which is the order a reader naturally does it in — rest on the
  // link, then reach for the key.
  onModifierChange(evt) {
    if (!this.settings.enabled) return;
    if (!this.pointer) return;
    this.rememberModifiers(evt);
    if (!this.modifierHeld()) return;
    if (!this.pointer.target) return;
    this.evaluate({
      clientX: this.pointer.x,
      clientY: this.pointer.y,
      target: this.pointer.target
    });
  }
  // The modifier flags carried by an event, kept as plain state. Mouse events are
  // authoritative while the pointer moves; key events are what tell us about a key pressed
  // with the pointer still.
  rememberModifiers(evt) {
    this.held = {
      ctrlKey: !!evt.ctrlKey,
      shiftKey: !!evt.shiftKey,
      altKey: !!evt.altKey,
      metaKey: !!evt.metaKey
    };
  }
  // Whether the key the reader chose for previewing is down right now.
  modifierHeld() {
    const s = this.settings;
    return shouldPreview(this.held || {}, s.hoverModifier, s.hoverModifiers, this.isMac());
  }
  // Whether the source line under the pointer holds a code target — used to keep Obsidian's
  // own Page preview from answering a link that is ours.
  pointerOnCodeLink(evt) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view && view.editor && view.editor.cm;
    if (!cm) return false;
    let pos;
    try {
      pos = cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
    } catch (e) {
      return false;
    }
    if (pos == null) return false;
    if (!pointerOverPos(cm, pos, evt)) return false;
    const line = cm.state.doc.lineAt(pos);
    const col = pos - line.from;
    return findTargets(line.text).some((hit) => col >= hit.hitStart && col <= hit.hitEnd);
  }
  // Cmd rather than Ctrl on a Mac: that is the key Obsidian itself uses, so a Mac reader
  // gets the behaviour they already know.
  isMac() {
    const platform = typeof process !== "undefined" && process.platform || "";
    return platform === "darwin";
  }
  // The pointer left a link. This used to be skipped whenever the preview was not visible,
  // which is precisely the moment it mattered: a preview still inside its show delay is
  // invisible, and leaving it alone let it appear afterwards. It is also the only signal a
  // pointer resting on a link then moving to the blank space beside it ever produces.
  onPointerOut(evt) {
    const from = evt.target;
    const to = evt.relatedTarget;
    if (to && this.preview.contains(to)) return;
    if (from && to && from.contains && from.contains(to)) return;
    this.pointer = null;
    this.leavePreview();
  }
  // The target under the pointer, with the note it belongs to and which surface answered —
  // or null. The surface matters: reading view previews on a plain hover, the editor waits
  // for the key, because that is what Obsidian itself does.
  hitAt(evt) {
    const anchor = this.linkFromEvent(evt);
    if (anchor) return Object.assign(anchor, { surface: "reading" });
    const editor = this.editorHit(evt);
    if (editor) return Object.assign(editor, { surface: "editor" });
    return null;
  }
  // Take every rendered code link out of Page preview's reach.
  //
  // Obsidian tags a rendered markdown link `internal-link` when it looks like a vault
  // path, and its Page preview plugin then treats it as one: it looks the path up in the
  // vault, does not find it (it is a file on disk, not a note), and shows a "not found"
  // popover beside ours. Swapping the class for `external-link` stops that at the source —
  // Page preview ignores external links — while leaving the element otherwise untouched,
  // so our own listener and Obsidian's normal open-on-click still work.
  markCodeLinks(root) {
    const anchors = root.querySelectorAll ? root.querySelectorAll("a") : [];
    for (const a of anchors) {
      const raw = a.getAttribute("href") || a.getAttribute("data-href") || "";
      if (!raw) continue;
      const target = parseTarget(raw);
      if (!target || target.kind !== "code") continue;
      const fixes = codeLinkFixes({
        href: a.getAttribute("href"),
        dataHref: a.getAttribute("data-href")
      });
      if (!fixes) continue;
      for (const cls of fixes.remove) a.classList.remove(cls);
      for (const cls of fixes.add) a.classList.add(cls);
      for (const attr of fixes.stripAttrs) a.removeAttribute(attr);
    }
  }
  // Reading view: the rendered link carries a real href, so the nearest <a> is the answer.
  linkFromEvent(evt) {
    for (let el = evt.target; el; el = el.parentElement) {
      if (el.tagName === "A") {
        const raw = el.getAttribute("href") || el.getAttribute("data-href") || "";
        if (!raw) return null;
        const target = parseTarget(raw);
        if (!target) return null;
        return { target, sourcePath: this.sourcePathFor(el) };
      }
    }
    return null;
  }
  // The note a rendered element belongs to. `activeSourcePath` answers the pane with the
  // *focus*, and the pointer can rest on a link in any pane: with two notes open, a
  // relative link (`../src/main.c`) read against the focused note names a different file
  // than the same link in the pane under the pointer. The leaf containing the element is
  // the pane that rendered it, so its note is the one the path resolves from. An anchor
  // outside every leaf (a popover, a sidebar) falls back to the active note, which is the
  // old answer and still a better guess than nothing.
  sourcePathFor(el) {
    const leafEl = el && el.closest ? el.closest(".workspace-leaf") : null;
    const workspace = this.app && this.app.workspace;
    if (leafEl && workspace && typeof workspace.getLeavesOfType === "function") {
      for (const leaf of workspace.getLeavesOfType("markdown")) {
        if (leaf && leaf.containerEl === leafEl && leaf.view && leaf.view.file) {
          return leaf.view.file.path;
        }
      }
    }
    return this.activeSourcePath();
  }
  // Live Preview: a code link is literal text inside CodeMirror, with no element to hang a
  // listener on. The pointer's position is turned into a document offset, and the line it
  // lands on is scanned — so the column decides which link, exactly as it would on screen.
  editorHit(evt) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor) return null;
    if (view.containerEl && !view.containerEl.contains(evt.target)) return null;
    const cm = view.editor.cm;
    if (!cm) return null;
    try {
      if (!cm.state.field(editorLivePreviewField)) return null;
    } catch (e) {
      return null;
    }
    const content = cm.contentDOM;
    if (content && !content.contains(evt.target)) return null;
    let pos;
    try {
      pos = cm.posAtCoords({ x: evt.clientX, y: evt.clientY });
    } catch (e) {
      return null;
    }
    if (pos == null) return null;
    if (!pointerOverPos(cm, pos, evt)) return null;
    const line = cm.state.doc.lineAt(pos);
    const col = pos - line.from;
    const hits = findTargets(line.text);
    for (const hit of hits) {
      if (col >= hit.hitStart && col <= hit.hitEnd) {
        return { target: hit.target, sourcePath: this.activeSourcePath() };
      }
    }
    return null;
  }
  activeSourcePath() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view && view.file ? view.file.path : "";
  }
};
module.exports = HoverPreviewPlugin;
module.exports.default = HoverPreviewPlugin;
