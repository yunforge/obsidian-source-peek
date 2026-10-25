# Source Peek

Rest the pointer on a link and read what it points at — without leaving the note, without
switching windows.

An Obsidian plugin for the **code links** and **web links** you write in your notes. Hover
one and a panel appears showing exactly what it names: a few lines of a source file, a file
inside a repository, or a section of a web page.

**Desktop only** — it reads source files off disk through Node's filesystem API.

**Chinese documentation**: [README.zh.md](README.zh.md)

---

## Getting started

1. Install and enable the plugin (see [Installation](#installation))
2. Write a code link in a note:

   ```markdown
   [the parser](../src/main.c#L18)
   ```

3. Rest the pointer on it — **a plain hover in reading view**, **Ctrl + hover in the editor**
4. A panel appears showing line 18 of `../src/main.c`

> Why two rules? Because Obsidian's own page preview works that way: no key while reading,
> Ctrl while editing. The plugin matches it deliberately, so your muscle memory carries over.

---

## Link syntax

### 1. Source code on disk

```markdown
[the parser](../src/main.c#L18)         one line
[the loop](../src/main.c#L18-23)        a range of lines
[the same](../src/main.c#L18-L23)       also a range (GitHub's spelling)
```

**The line is required.** A path with no `#L18` is not a code link — with no line named,
there is nothing to show.

On hover:

- Only the lines you named, **no surrounding context**
- Syntax highlighted, by file extension
- Lines over 500 characters are cut, so a minified file cannot blow up the panel

**How a path resolves** — two forms, both bounded by the vault:

| Form | Relative to |
| --- | --- |
| `./src/main.rs`, `../02_use_paths/src/a.rs` | the **note's own folder**; `..` walks up |
| `/src/main.rs` | the **vault root** — a leading slash means the top of the vault, not the filesystem |

**Nothing may point outside the vault.** That is deliberate: this plugin previews the
notebook's own code. To reference someone else's repository, use a GitHub or GitLab link
(below), which goes through the web-fetch path. A path that climbs above the vault is
refused, not read.

### 2. Code in a repository

```markdown
[upstream](https://github.com/owner/repo/blob/main/src/main.c#L18-L23)
```

A GitHub or GitLab blob link is fetched at its raw URL and shown exactly like a local file.

| Host | What you write | What is fetched |
| --- | --- |
| GitHub | `github.com/o/r/blob/main/a.c` | `raw.githubusercontent.com/o/r/main/a.c` |
| GitLab | `gitlab.com/g/p/-/blob/main/a.c` | `gitlab.com/g/p/-/raw/main/a.c` |

### 3. Web pages

```markdown
[the page](https://example.com/page)
[one section](https://example.com/page#install)
[start to a section](https://example.com/page#-#install)
[between two sections](https://example.com/page#install-usage)
[a section onward](https://example.com/page#install-)
```

The text after `#` locates a heading, and a dash says how much of the page to take:

| Fragment | Shows |
| --- | --- |
| *(none)* | the whole page |
| `#install` | that heading **and what is under it**, up to the next heading of the same rank or higher |
| `#-#install` | from the **top of the page** up to that heading, **not including** it |
| `#install-usage` | from `install` up to, **not including**, `usage` |
| `#install-` | from that heading to the **end of the page** |

**A heading is matched three ways**, in order:

1. **The element's `id`** — the anchor you copy out of the address bar. Many documentation
   sites put the id on a container wrapping the heading (rustdoc has
   `<section id="method.new"><h4>pub const fn new()...</h4>`), and that id is often nothing
   like the heading's text
2. **The heading text, slugged** — lower-cased, punctuation dropped, spaces to dashes.
   `#getting-started` finds `Getting Started`
3. **The heading text itself**, ignoring case — the fallback, for a heading that is all
   punctuation

**What if the heading's own name contains a dash?** `#getting-started`, say. The whole
fragment is tried as one heading first; only if that fails is it split on dashes as a range.
When splitting, each dash is tried in turn and the first split whose two halves both resolve
is the one meant.

**When a named heading is not on the page**, the panel says so and draws nothing. Falling
back to the whole page would answer a question you did not ask.

---

## How a page is drawn

A previewed page is not a heap of plain text:

- **Headings** keep their level (h1–h6), so the page's shape comes through
- **Paragraphs** wrap
- **Lists** get bullets
- **Block quotes** get a left border
- **Inline code** (`<code>`) is drawn in a monospace chip, not merged into the sentence
- **Code blocks** (`<pre>`) get a box, syntax highlighting, their indentation, and sideways
  scrolling

Code-block languages are read from the spellings documentation sites actually use:

| Spelling | Where it comes from |
| --- | --- |
| `language-python` / `lang-js` | Prism, and the common Markdown renderers |
| `highlight-python3` | Sphinx, and so the Python docs |
| `brush: js` | Alex Gorbatchev's highlighter, and so MDN |
| `data-lang="go"` | a plain attribute some sites use |

Version digits are trimmed: `python3` → `python`, `html5` → `html`.

---

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| **Preview on hover** | on | Master switch. The command *Toggle hover preview* flips it too |
| **Show preview while holding** | Ctrl | The key a hover waits for: Ctrl, Shift, Alt, a custom combination, or **A plain hover**. Ctrl matches Obsidian's own page preview, and is Cmd on a Mac |

The settings pane also ends with a syntax crib, so you need not come back here.

---

## Behaviour worth knowing

**Order does not matter** — press Ctrl then move onto the link, or move onto it and then
press Ctrl; both work. Releasing the key does not retract the panel (a finger lifting should
not make it vanish) — move the pointer away, or press Escape.

**Only the link itself triggers it** — blank space beside a link does nothing, even on a
line that ends with one.

**You can move into the panel** — it is not a tooltip that vanishes at the first twitch. You
can scroll it, and select text in it.

**It closes** on scroll, on Escape, on a click elsewhere, and when the window loses focus.

**It does not fight Obsidian's own features** — a code link is marked as an external link,
so Page preview neither looks for it in the vault nor shows its "not found" or "Follow link"
prompts. Ordinary vault links and attachment links are untouched.

---

## Known limits

**A page rendered by JavaScript cannot be previewed.** The plugin fetches the HTML the server
sends and does not run scripts, so a single-page app like `help.obsidian.md` arrives as an
empty shell. That is a hard edge of `requestUrl`, not something to work around.

**Very long pages are slow.** A page is drawn whole; there is no limit to tune. Rust's `Vec`
documentation page is 955 KB with hundreds of headings, and previewing it whole is noticeably
slow — narrow it with a heading fragment. A fixed ceiling of 2000 blocks exists only to stop a
pathological document, and no real documentation page reaches it.

**Prism loads grammars on demand.** A code block in a language that has never appeared in a
note before may show uncoloured the first time. Obsidian fills it in after a render, but the
preview panel is transient.

---

## Installation

**Manually**: copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/source-peek/`, then enable the plugin. The three files are on
the [Releases](https://github.com/yunforge/obsidian-source-peek/releases) page, or build
them from source as below.

**From source**:

```sh
git clone https://github.com/yunforge/obsidian-source-peek.git
cd obsidian-source-peek
npm install
npm run build     # writes main.js and styles.css
npm test          # runs every test
```

`main.js` and `styles.css` are generated — edit `src/` and rebuild rather than editing them.

---

## Compatibility

Requires Obsidian 1.4.0 or newer. Desktop only — mobile has no Node filesystem API.

The interface follows Obsidian's language setting. **English** and **Simplified Chinese**
ship today; anything else falls back to English.

To add a language, copy `src/locales/en.js` to `src/locales/<tag>.js`, translate it, and add
it to `LOCALES` in `src/i18n.js`. A regional tag resolves to its base (`zh-TW` → `zh`), so
one file per language is enough.

---

## License

MIT, see [LICENSE](LICENSE).
