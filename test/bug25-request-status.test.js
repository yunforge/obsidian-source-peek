'use strict';

// bug25: fetchSection called requestUrl({ url }) without `throw: false`. Obsidian's
// requestUrl throws on a non-2xx status unless told otherwise, so a 404 never reached the
// `status < 200 || >= 300` branch — it surfaced as whatever error requestUrl threw, with
// wording nobody here controls — and a response with no status at all was reported as
// "HTTP 0", which tells the reader nothing. fetchText (remote.js) has always passed
// `throw: false` and answered "HTTP 404"; the page fetch now does the same, and a missing
// status says so instead of inventing a zero.
//
// The stub below is faithful to the real contract: it throws for a bad status unless the
// caller passed `throw: false` — which is exactly the difference the fix is about.

const assert = require('assert/strict');
const Module = require('module');

function section(label, fn) {
  return Promise.resolve().then(fn).catch((err) => {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  });
}

// Obsidian's requestUrl, as the plugin experiences it: throws on a non-2xx status unless
// `throw: false` was passed; answers `{ status, headers, text }` otherwise.
function obsidianWith(response, networkError) {
  return async (opts) => {
    if (networkError) throw networkError;
    // Obsidian throws on a bad status only when the caller did not ask it not to:
    // `throw: false` (the exact value) is what suppresses it.
    if (!opts || opts.throw !== false) {
      if (response.status && (response.status < 200 || response.status >= 300)) {
        throw new Error('Request failed with status code ' + response.status);
      }
    }
    return response;
  };
}

// Run fn with `obsidian` stubbed, so fetchSection/fetchText exercise their lazy require.
async function withObsidian(stub, fn) {
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === 'obsidian') return stub;
    return origLoad.apply(this, arguments);
  };
  try {
    return await fn();
  } finally {
    Module._load = origLoad;
  }
}

module.exports = {
  name: 'bug25: a bad status is reported as a status, and a missing one is not HTTP 0',
  async run() {
    await section('a 404 is answered as HTTP 404, not as requestUrl\'s own error', async () => {
      const { fetchSection } = require('../src/web');
      const res = await withObsidian(
        { requestUrl: obsidianWith({ status: 404, headers: {}, text: '' }) },
        () => fetchSection('https://example.com/gone'));
      assert.equal(res.error, 'HTTP 404');
      assert.deepEqual(res.blocks, []);
    });

    await section('the same 404 through fetchText agrees with it', async () => {
      const { fetchText } = require('../src/remote');
      const res = await withObsidian(
        { requestUrl: obsidianWith({ status: 404, headers: {}, text: '' }) },
        () => fetchText('https://example.com/gone'));
      assert.equal(res.ok, false);
      assert.equal(res.error, 'HTTP 404', 'both fetch paths speak the same status language');
    });

    await section('a response with no status code is not "HTTP 0"', async () => {
      const { fetchSection } = require('../src/web');
      const res = await withObsidian(
        { requestUrl: obsidianWith({ headers: {}, text: 'hello' }) },
        () => fetchSection('https://example.com/odd'));
      assert.equal(res.error, 'HTTP status unknown');
    });

    await section('a 200 page still previews', async () => {
      const { fetchSection } = require('../src/web');
      const res = await withObsidian(
        { requestUrl: obsidianWith({ status: 200, headers: { 'content-type': 'text/html' }, text: '<p>hi</p>' }) },
        () => fetchSection('https://example.com/'));
      assert.equal(res.error, '');
      assert.deepEqual(res.blocks, [{ type: 'p', text: 'hi' }]);
    });

    await section('a 200 non-markup body stays one verbatim block', async () => {
      const { fetchSection } = require('../src/web');
      const res = await withObsidian(
        { requestUrl: obsidianWith({ status: 200, headers: { 'content-type': 'text/plain' }, text: 'l1\nl2' }) },
        () => fetchSection('https://example.com/x.txt'));
      assert.equal(res.error, '');
      assert.deepEqual(res.blocks, [{ type: 'pre', text: 'l1\nl2' }]);
    });

    await section('a genuine network failure still names the error', async () => {
      const { fetchSection } = require('../src/web');
      const res = await withObsidian(
        { requestUrl: obsidianWith(null, new Error('getaddrinfo ENOTFOUND example.com')) },
        () => fetchSection('https://example.com/'));
      assert.equal(res.error, 'getaddrinfo ENOTFOUND example.com');
    });
  },
};
