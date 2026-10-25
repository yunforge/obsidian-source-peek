'use strict';

// bug35: fetchText read the status as `res && res.status` and gated the failure branch on
// `if (status && ...)` — so a response that arrived with *no* status at all was falsy,
// skipped the branch, and was answered as a success with whatever body it had.
// fetchSection (bug25) already answered "HTTP status unknown" for that case; the two
// fetch paths must speak one status language, because the same odd response reaches
// either depending only on whether the link named a heading or a line.

const assert = require('assert/strict');
const Module = require('module');

function section(label, fn) {
  return Promise.resolve().then(fn).catch((err) => {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  });
}

// Obsidian's requestUrl, as the plugin experiences it (the same stub as bug25): throws on
// a bad status unless `throw: false` was passed; answers `{ status, headers, text }`.
function obsidianWith(response) {
  return async (opts) => {
    if (!opts || opts.throw !== false) {
      if (response.status && (response.status < 200 || response.status >= 300)) {
        throw new Error('Request failed with status code ' + response.status);
      }
    }
    return response;
  };
}

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
  name: 'bug35: fetchText does not read a missing status as success',
  async run() {
    const { fetchText } = require('../src/remote');

    await section('a response with no status is not a success', async () => {
      const res = await withObsidian(
        { requestUrl: obsidianWith({ headers: {}, text: 'some body' }) },
        () => fetchText('https://example.com/odd.txt'));
      assert.equal(res.ok, false, 'a status that cannot be judged is not a 200');
      assert.equal(res.text, '');
      assert.equal(res.error, 'HTTP status unknown', 'the same wording fetchSection uses');
    });

    await section('a genuine 200 still comes through', async () => {
      const res = await withObsidian(
        { requestUrl: obsidianWith({ status: 200, headers: {}, text: 'l1\nl2' }) },
        () => fetchText('https://example.com/ok.c'));
      assert.equal(res.ok, true);
      assert.equal(res.text, 'l1\nl2');
      assert.equal(res.error, '');
    });

    await section('a 404 is still HTTP 404 (bug25\'s contract, unchanged)', async () => {
      const res = await withObsidian(
        { requestUrl: obsidianWith({ status: 404, headers: {}, text: '' }) },
        () => fetchText('https://example.com/gone.c'));
      assert.equal(res.ok, false);
      assert.equal(res.error, 'HTTP 404');
    });
  },
};
