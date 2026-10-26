'use strict';

// Turning a window of source lines, or a list of page blocks, into DOM.
//
// Prism is loaded lazily through Obsidian's own `loadPrism()`, so nothing here needs a
// grammar to be present up front.

// Past this many lines, tokenizing costs more than it is worth and the UI starts to
// stutter; such a snippet is drawn as plain text instead. Defined once, in code.js.
const { PRISM_MAX_LINES } = require('./code');

let prismPromise = null;

// A failed `loadPrism()` is forgotten rather than cached: it can fail for a reason that has
// nothing to do with the rest of the session (Obsidian not ready yet), and remembering it
// left every later snippet unhighlighted with no way back. Callers that arrive while an
// attempt is in flight still share it, so a burst of code blocks costs one load.
function ensurePrism() {
  if (!prismPromise) {
    let failed = false;
    prismPromise = (async () => {
      try {
        const { loadPrism } = require('obsidian');
        return await loadPrism();
      } catch {
        failed = true;
        return null;
      }
    })().then((P) => {
      // Cleared after the attempt settles, not inside it, so the callers already waiting on
      // this promise still receive its `null` instead of starting a load of their own.
      if (failed) prismPromise = null;
      return P;
    });
  }
  return prismPromise;
}

// Prism hands back a tree of strings and token objects; building DOM from it avoids
// assigning innerHTML with content that came off the network or off disk.
function renderTokens(parent, tokens) {
  for (const tok of tokens) {
    // A null slot in the tree draws nothing; reading a class off it would throw.
    if (tok == null) continue;
    if (typeof tok === 'string') {
      parent.appendText(tok);
      continue;
    }
    const alias = Array.isArray(tok.alias) ? tok.alias.join(' ') : tok.alias || '';
    const span = parent.createSpan({ cls: ('token ' + tok.type + ' ' + alias).trim() });
    if (typeof tok.content === 'string') span.setText(tok.content);
    // A token with no content at all (Prism can emit `content: null` for empty matches)
    // draws its span and nothing inside it; wrapping the null into a one-element array and
    // recursing would come back to `null.alias` and take the whole preview down.
    else if (tok.content != null) renderTokens(span, Array.isArray(tok.content) ? tok.content : [tok.content]);
  }
}

function grammarFor(P, prismId) {
  if (!P || !P.languages) return null;
  // No named language, no colouring: the block keeps its text rather than being painted
  // with whatever clike happens to survive — that is the promise the web parser's own
  // comment makes, and this fallback used to break it. An unknown name answers null for
  // the same reason: a guess is still a guess.
  if (!prismId) return null;
  return P.languages[prismId] || null;
}

// A <pre><code> holding `text`, highlighted for `prismId` when a grammar is available.
// No `language-*` class is attached: a theme would repaint the block with its own opaque
// code-block styling, which is not this panel's.
async function renderCode(parent, text, prismId) {
  const P = text.split('\n').length <= PRISM_MAX_LINES ? await ensurePrism() : null;
  const grammar = grammarFor(P, prismId);
  const pre = parent.createEl('pre', { cls: 'cp-code' });
  const code = pre.createEl('code');
  if (grammar) renderTokens(code, P.tokenize(text, grammar));
  else code.setText(text);
  return pre;
}

// A page block. Headings keep their level so the reader can see the page's shape; a
// code block from the page keeps its line breaks, everything else is a paragraph.
// One block of a page.
//
// Running text may carry inline code (`parts`), which is drawn as a monospace chip so a
// command in a sentence reads as a command. A code block is highlighted for the language
// the page declared, and falls back to plain text when it declared none.
async function renderBlock(parent, block) {
  const type = block && block.type;

  if (type === 'h') {
    const level = Math.min(6, Math.max(1, block.level || 2));
    parent.createEl('h' + level, { cls: 'cp-h', text: block.text });
    return;
  }

  if (type === 'pre') {
    // The grammar comes from the page (`language-python` and friends). Without one the
    // block is still a code block — it just is not coloured, rather than being guessed at.
    return renderCode(parent, block.text, block.lang || '').then((pre) => pre.addClass('cp-web-pre'));
  }

  if (type === 'li') {
    const row = parent.createEl('div', { cls: 'cp-li' });
    row.createSpan({ cls: 'cp-li-bullet', text: '•' });
    appendText(row, block);
    return;
  }

  if (type === 'quote') {
    const quote = parent.createEl('blockquote', { cls: 'cp-quote' });
    appendText(quote, block);
    return;
  }

  const para = parent.createEl('p', { cls: 'cp-p' });
  appendText(para, block);
}

// The block's text, with any inline code drawn as its own element.
function appendText(parent, block) {
  const parts = block && block.parts;
  if (!parts || !parts.length) {
    parent.appendText(block.text || '');
    return;
  }
  for (const part of parts) {
    if (!part.text) continue;
    if (part.code) parent.createEl('code', { cls: 'cp-inline-code', text: part.text });
    else parent.appendText(part.text);
  }
}

// Every block in order. Returns the number actually drawn, so the caller can say when a
// page was cut short rather than quietly dropping the tail.
async function renderBlocks(parent, blocks) {
  let n = 0;
  for (const block of blocks || []) {
    if (!block || !block.text) continue;
    // A code block resolves Prism asynchronously; the rest draw immediately. Awaiting each
    // keeps the order the page had.
    await renderBlock(parent, block);
    n++;
  }
  return n;
}

// renderBlock stays module-internal: renderBlocks is its only consumer.
// Test seam: `ensurePrism` is consumed only by test/.
module.exports = { renderCode, renderBlocks, ensurePrism };
