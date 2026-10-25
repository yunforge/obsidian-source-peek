'use strict';

// bug12: a Prism load that failed once used to be remembered forever.
//
// `ensurePrism()` cached the promise of the *failed* attempt, and that promise had already
// resolved — to `null`. So one transient failure (Obsidian not ready yet, a throw inside
// `loadPrism`) meant every later code block of the session was drawn unhighlighted, with no
// retry. The fix must forget a failure while still folding concurrent callers onto one load.

const assert = require('assert/strict');
const Module = require('module');

// --- a Prism good enough for `renderCode` --------------------------------

const PRISM = {
  languages: { clike: {} },
  // A string and a token, so both branches of `renderTokens` run.
  tokenize: (text) => [text, { type: 'keyword', content: 'x' }],
};

// --- a DOM small enough to reason about (same shape as popover.test.js) --

class El {
  constructor() {
    this.children = [];
    this.text = '';
  }
  createSpan(o) { return this.createEl(o); }
  createEl(o) {
    const el = new El();
    if (o && o.text != null) el.text = String(o.text);
    this.children.push(el);
    return el;
  }
  appendText(t) { this.text += String(t); }
  setText(t) { this.text = String(t); }
}

function section(label, fn) {
  return Promise.resolve()
    .then(fn)
    .catch((err) => {
      err.message = '[' + label + '] ' + err.message;
      throw err;
    });
}

module.exports = {
  name: 'bug12: a failed Prism load is not remembered',
  async run() {
    // Every scenario needs its own copy of the module: `prismPromise` is module state.
    const renderPath = require.resolve('../src/render');
    const origLoad = Module._load;
    let attempts = 0;
    let loadPrismImpl = async () => PRISM;

    function freshRender() {
      delete require.cache[renderPath];
      return require(renderPath);
    }

    Module._load = function (request) {
      if (request === 'obsidian') {
        return {
          loadPrism: (...args) => {
            attempts++;
            return loadPrismImpl(...args);
          },
        };
      }
      return origLoad.apply(this, arguments);
    };

    try {
      await section('a failed load is retried by the next call', async () => {
        attempts = 0;
        let first = true;
        loadPrismImpl = async () => {
          if (first) {
            first = false;
            throw new Error('obsidian is not ready yet');
          }
          return PRISM;
        };

        const { ensurePrism } = freshRender();
        assert.equal(await ensurePrism(), null, 'the failed load yields null');
        assert.equal(attempts, 1, 'exactly one attempt was made');

        const second = await ensurePrism();
        assert.notEqual(second, null, 'the retry returns Prism rather than the cached failure');
        assert.equal(second, PRISM, 'the retry hands back what loadPrism resolved to');
        assert.equal(attempts, 2, 'the second call really retried');
      });

      await section('a rejected load is retried too', async () => {
        attempts = 0;
        let first = true;
        loadPrismImpl = () => {
          if (first) {
            first = false;
            return Promise.reject(new Error('loadPrism rejected'));
          }
          return Promise.resolve(PRISM);
        };

        const { ensurePrism } = freshRender();
        assert.equal(await ensurePrism(), null);
        assert.equal(await ensurePrism(), PRISM);
        assert.equal(attempts, 2);
      });

      await section('concurrent callers share one in-flight load', async () => {
        attempts = 0;
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        loadPrismImpl = async () => {
          await gate;
          return PRISM;
        };

        const { ensurePrism } = freshRender();
        const inFlight = [ensurePrism(), ensurePrism(), ensurePrism()];
        assert.equal(attempts, 1, 'three concurrent callers start one load, not three');
        release();
        const results = await Promise.all(inFlight);
        assert.deepEqual(results, [PRISM, PRISM, PRISM], 'all callers get Prism');
        assert.equal(attempts, 1, 'no extra load after it settled');
      });

      await section('a load that succeeded is never repeated', async () => {
        attempts = 0;
        loadPrismImpl = async () => PRISM;

        const { ensurePrism } = freshRender();
        await ensurePrism();
        await ensurePrism();
        await ensurePrism();
        assert.equal(attempts, 1, 'a successful load is cached');
      });

      await section('concurrent callers of a retry do not storm the loader', async () => {
        attempts = 0;
        let first = true;
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        loadPrismImpl = async () => {
          if (first) {
            first = false;
            throw new Error('first attempt fails');
          }
          await gate;
          return PRISM;
        };

        const { ensurePrism } = freshRender();
        assert.equal(await ensurePrism(), null, 'the first attempt fails');
        const retries = [ensurePrism(), ensurePrism(), ensurePrism()];
        assert.equal(attempts, 2, 'three retries start one load, not three');
        release();
        assert.deepEqual(await Promise.all(retries), [PRISM, PRISM, PRISM]);
        assert.equal(attempts, 2);
      });

      await section('renderCode highlights the block once the retry succeeds', async () => {
        // The prismId is the language this stub actually knows. It used to read 'c' and
        // relied on grammarFor's clike fallback to tokenize an unknown name — bug27 removed
        // that guess on purpose, and the intent here (a failed load, then a tokenized
        // retry) never depended on it.
        attempts = 0;
        let first = true;
        loadPrismImpl = async () => {
          if (first) {
            first = false;
            throw new Error('transient');
          }
          return PRISM;
        };

        const { renderCode } = freshRender();
        const plain = new El('div');
        await renderCode(plain, 'int x;', 'clike');
        const plainCode = plain.children[0].children[0];
        assert.equal(plainCode.text, 'int x;', 'the failed first draw is plain text');
        assert.equal(plainCode.children.length, 0, 'and carries no token spans');

        const lit = new El('div');
        await renderCode(lit, 'int x;', 'clike');
        const litCode = lit.children[0].children[0];
        assert.equal(litCode.children.length, 1, 'the retried draw is tokenized');
        assert.equal(litCode.children[0].text, 'x', 'the token carries its content');
        assert.equal(litCode.text, 'int x;', 'and the string part is appended beside it');
        assert.equal(attempts, 2, 'the second block triggered the retry');
      });
    } finally {
      Module._load = origLoad;
      // Leave no stubbed module behind for the test files that run after this one.
      delete require.cache[renderPath];
    }
  },
};
