'use strict';

// Plain-text MIME types must not go through the HTML parser.
//
// `isMarkupContentType` answered "yes, parse it" for every `text/*`, so `text/plain`,
// `text/csv`, `text/markdown`, `text/xml` and friends were fed to the extractor. The parser
// collapses whitespace and drops angle-bracket runs, so the report's evidence was:
//
//   text/plain            "line1\nline2"    -> p:"line1 line2"      (newline became a space)
//   text/markdown         "Use <T> generic" -> p:"Use generic."     (<T> eaten as a tag)
//   text/xml              "<?xml ...?>"     -> p:"..."              (structure stripped)
//
// while `application/json` already rendered correctly as one `pre` block. The reporting path
// for non-markup bodies (`textBodyResult`) existed all along; plain text simply never reached
// it. HTML must keep parsing exactly as before, and a *missing* content type still means
// "markup" — that is the common case for a page and the baseline comment says so.

const assert = require('assert/strict');
const Module = require('module');
const { fetchSection } = require('../src/web');

async function section(label, fn) {
  try {
    await fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

// fetchSection calls `require('obsidian')` on every invocation and destructures `requestUrl`
// from it, so patching the loader for the duration of a call is enough — and `fetchSection`
// itself was already required above, which keeps that require from touching the stub.
async function fetchWith(contentType, text, maxBlocks) {
  const headers = {};
  if (contentType !== undefined) headers['content-type'] = contentType;
  const origLoad = Module._load;
  Module._load = function (request) {
    // status 200 is not optional: anything else and fetchSection stops at "HTTP 0" with no
    // blocks, which would make every assertion below pass vacuously.
    if (request === 'obsidian') return { requestUrl: async () => ({ status: 200, headers, text }) };
    return origLoad.apply(this, arguments);
  };
  try {
    return await fetchSection('https://example.com/x', '', maxBlocks);
  } finally {
    Module._load = origLoad;
  }
}

// One block, of type `pre`, whose text is the body verbatim.
function assertPlainBody(label, result, body) {
  assert.equal(result.error, '', label + ': no error, got ' + result.error);
  assert.equal(result.blocks.length, 1, label + ': exactly one block');
  assert.equal(result.blocks[0].type, 'pre', label + ': a pre block, got ' + result.blocks[0].type);
  assert.equal(result.blocks[0].text, body, label + ': text is the body verbatim');
}

// The HTML parser's fingerprints: no `pre`, and a typed heading or paragraph block instead.
function assertParsedAsHtml(label, result) {
  assert.equal(result.error, '', label + ': no error, got ' + result.error);
  assert.ok(result.blocks.length > 0, label + ': the parser produced blocks');
  assert.ok(result.blocks.every((b) => b.type !== 'pre'), label + ': no block is a pre');
}

module.exports = {
  name: 'bug06: plain-text MIME stays one verbatim pre block',
  async run() {
    // --- the evidence rows from the report, verbatim bodies ---

    await section('text/plain keeps its newlines', async () => {
      const body = 'line1\nline2';
      assertPlainBody('text/plain', await fetchWith('text/plain', body), body);
    });

    await section('text/csv is not reflowed into a paragraph', async () => {
      const body = 'name,qty\napple,3\npear,5';
      assertPlainBody('text/csv', await fetchWith('text/csv', body), body);
    });

    await section('text/markdown keeps angle brackets', async () => {
      // The parser would read `<T>` as an element and swallow it.
      const body = 'Use <T> generic.\n\nSecond line.';
      const result = await fetchWith('text/markdown', body);
      assertPlainBody('text/markdown', result, body);
      assert.ok(result.blocks[0].text.includes('<T>'), 'generics survive: ' + result.blocks[0].text);
    });

    // --- the other text/* types with no HTML semantics ---

    await section('text/javascript keeps its source', async () => {
      const body = 'function f() {\n  return 1 < 2;\n}';
      assertPlainBody('text/javascript', await fetchWith('text/javascript', body), body);
    });

    await section('text/css keeps its rules', async () => {
      const body = 'a > b {\n  color: red;\n}';
      assertPlainBody('text/css', await fetchWith('text/css', body), body);
    });

    await section('text/xml keeps its structure', async () => {
      const body = '<?xml version="1.0"?>\n<root><item>x</item></root>';
      const result = await fetchWith('text/xml', body);
      assertPlainBody('text/xml', result, body);
      assert.ok(result.blocks[0].text.includes('<root>'), 'markup survives: ' + result.blocks[0].text);
    });

    await section('text/plain with parameters', async () => {
      const body = 'line1\nline2';
      assertPlainBody('text/plain; charset=utf-8', await fetchWith('text/plain; charset=utf-8', body), body);
    });

    await section('text/plain, mixed case', async () => {
      const body = 'a\nb';
      assertPlainBody('Text/Plain', await fetchWith('Text/Plain', body), body);
      assertPlainBody('TEXT/PLAIN; Charset=UTF-8', await fetchWith('TEXT/PLAIN; Charset=UTF-8', body), body);
    });

    // --- the control group: non-markup bodies already went this way ---

    await section('application/json still one pre block', async () => {
      const body = '{"a": 1}';
      assertPlainBody('application/json', await fetchWith('application/json', body), body);
    });

    await section('application/ld+json is still plain text (baseline)', async () => {
      const body = '{"@type":"Thing"}';
      assertPlainBody('application/ld+json', await fetchWith('application/ld+json', body), body);
    });

    // --- HTML must not have moved ---

    await section('text/html still goes through the parser', async () => {
      const result = await fetchWith('text/html', '<p>hello</p>');
      assertParsedAsHtml('text/html', result);
      assert.deepEqual(result.blocks, [{ type: 'p', text: 'hello' }]);
      assert.equal(result.title, '', 'a title-less page has no title');
    });

    await section('text/html with parameters and mixed case', async () => {
      assert.deepEqual((await fetchWith('text/html; charset=utf-8', '<p>hello</p>')).blocks, [{ type: 'p', text: 'hello' }]);
      // Headings carry `type: 'h'` plus a `level`, which no `pre` block has.
      assert.deepEqual((await fetchWith('TEXT/HTML', '<h2>News</h2>')).blocks, [{ type: 'h', level: 2, text: 'News' }]);
    });

    await section('application/xhtml+xml still goes through the parser', async () => {
      const result = await fetchWith('application/xhtml+xml', '<p>x</p>');
      assertParsedAsHtml('application/xhtml+xml', result);
      assert.deepEqual(result.blocks, [{ type: 'p', text: 'x' }]);
    });

    await section('application/xml still goes through the parser (baseline)', async () => {
      // application/xml has no HTML end tags to honour, but it was parsed before and the
      // fix must not change it: only text/* is in scope.
      assert.equal((await fetchWith('application/xml', '<p>x</p>')).blocks[0].type, 'p');
    });

    await section('text/xml is plain text, unlike application/xml', async () => {
      // This is the one place the text/* allowlist makes a judgement call: text/xml has no
      // HTML semantics either, so leaving it in would hand an XML document to a parser that
      // strips its structure. Pinning it here records the choice. The two MIMEs therefore
      // disagree on purpose; a later change that unifies them must update this test rather
      // than silently flip text/xml back to the parser.
      const body = '<?xml version="1.0"?>\n<root><item>x</item></root>';
      const plain = await fetchWith('text/xml', body);
      assert.equal(plain.blocks.length, 1, 'text/xml: one block');
      assert.equal(plain.blocks[0].type, 'pre', 'text/xml: shown as pre');
      assert.equal(plain.blocks[0].text, body, 'text/xml: body kept as-is');
      assert.equal((await fetchWith('application/xml', body)).blocks[0].type, 'p',
        'application/xml is unchanged and still parsed');
    });

    await section('application/*+xml feeds still go through the parser', async () => {
      for (const type of ['application/rss+xml', 'application/atom+xml']) {
        assert.equal((await fetchWith(type, '<p>x</p>')).blocks[0].type, 'p', type);
      }
    });

    // --- no content type still means "a page" ---

    await section('a missing content type is still parsed as markup', async () => {
      const result = await fetchWith(undefined, '<p>hello</p>');
      assertParsedAsHtml('no content-type', result);
      assert.deepEqual(result.blocks, [{ type: 'p', text: 'hello' }]);
    });

    await section('an empty or malformed content type is still parsed as markup', async () => {
      // Baseline behaviour, kept: both fall through to the parser.
      assert.equal((await fetchWith('', '<p>x</p>')).blocks[0].type, 'p', 'empty string');
      assert.equal((await fetchWith('garbage', '<p>x</p>')).blocks[0].type, 'p', 'malformed');
    });

    // --- truncation still applies on the plain-text path ---

    await section('maxBlocks truncates the plain-text body', async () => {
      const result = await fetchWith('text/plain', 'l1\nl2\nl3\nl4', 2);
      assert.equal(result.truncated, true, 'truncated flag set');
      assert.deepEqual(result.blocks, [{ type: 'pre', text: 'l1\nl2' }], 'only the first two lines');
    });

    await section('a body within maxBlocks is not truncated', async () => {
      const result = await fetchWith('text/plain', 'l1\nl2', 2);
      assert.equal(result.truncated, false);
      assert.deepEqual(result.blocks, [{ type: 'pre', text: 'l1\nl2' }]);
    });
  },
};
