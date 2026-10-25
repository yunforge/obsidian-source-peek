'use strict';

// bug29: attributes written without quotes were invisible. `<h2 id=install>` lost its id,
// `<pre class=language-python>` lost its language, and a page declaring its content
// container as `<div id=content>` (no quotes — as plenty of hand-written and minified HTML
// does) fell back to showing the whole page. The attribute reader walks all four HTML
// spellings now: name=value, name="v", name='v', and a bare boolean name.
//
// Unquoted values run to the first whitespace, which is the entire HTML grammar for them
// (`rest` never contains the `>` — that ended the tag).

const assert = require('assert/strict');
const { extract } = require('../src/web');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

const headingIds = (html) =>
  extract(html).blocks.filter((b) => b.type === 'h').map((b) => b.id || '');
const langs = (html) =>
  extract(html).blocks.filter((b) => b.type === 'pre').map((b) => b.lang || '');

module.exports = {
  name: 'bug29: attributes written without quotes are read like any other',
  run() {
    section('an unquoted id is an anchor, on the heading and on containers', () => {
      assert.deepEqual(headingIds('<h2 id=install>Install</h2>'), ['install']);
      // Attribute names are case-insensitive, quoted or not.
      assert.deepEqual(headingIds('<h2 ID=upper>T</h2>'), ['upper']);
      assert.deepEqual(headingIds('<h2 id=install>T</h2><h2>Other</h2>'), ['install', '']);
      // A container's id reaches the heading inside it, quoted or not.
      assert.deepEqual(headingIds('<div id=outer><h2>Inner</h2></div>'), ['outer']);
      assert.deepEqual(headingIds('<section id=method.new><h4>New</h4></section>'), ['method.new']);
      // A fragment resolves against it.
      const r = extract('<h2 id=install>Install</h2><p>step one</p><h2>Usage</h2>', 'install');
      assert.equal(r.headingMiss, false);
      assert.deepEqual(r.blocks.map((b) => b.text), ['Install', 'step one']);
    });

    section('an unquoted class still names the language', () => {
      assert.deepEqual(langs('<pre class=language-python>x</pre>'), ['python']);
      assert.deepEqual(langs('<pre><code class=language-go>x</code></pre>'), ['go']);
      assert.deepEqual(langs('<div class=highlight-rust><pre>x</pre></div>'), ['rust']);
      // data-lang too.
      assert.deepEqual(langs('<pre data-lang=zig>x</pre>'), ['zig']);
    });

    section('quoted spellings are unchanged', () => {
      assert.deepEqual(headingIds('<h2 id="double">T</h2>'), ['double']);
      assert.deepEqual(headingIds("<h2 id='single'>T</h2>"), ['single']);
      assert.deepEqual(langs('<pre class="language-python">x</pre>'), ['python']);
      assert.deepEqual(langs("<pre class='language-python'>x</pre>"), ['python']);
    });

    section('boolean attributes do not disturb the neighbours', () => {
      assert.deepEqual(headingIds('<h2 hidden id=install>T</h2>'), ['install']);
      assert.deepEqual(headingIds('<h2 id=install hidden>T</h2>'), ['install']);
      assert.deepEqual(langs('<pre hidden class=language-python>x</pre>'), ['python']);
      // The container search — the reader's first consumer — still finds `role=main`
      // without quotes, and chrome around it stays out of the preview.
      assert.deepEqual(
        extract('<header>menu</header><main role=main><p>body</p></main><footer>foot</footer>').blocks.map((b) => b.text),
        ['body']);
      assert.deepEqual(
        extract('<header>menu</header><div id=content><p>body</p></div><footer>foot</footer>').blocks.map((b) => b.text),
        ['body']);
    });

    section('unquoted values end at whitespace, per the grammar', () => {
      assert.deepEqual(headingIds('<h2 id=install class=big>T</h2>'), ['install']);
      assert.deepEqual(headingIds('<h2 class=big id=install>T</h2>'), ['install']);
    });
  },
};
