'use strict';

// Reading source code that lives in a repository rather than on disk.
//
// A blob URL is a page for a human; the raw URL beside it is the file itself. Turning
// one into the other is pure string work, so it can be tested without a network.
//
//   github  https://github.com/{owner}/{repo}/blob/{ref}/{path}
//        -> https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
//   gitlab  https://gitlab.com/{group}/{project}/-/blob/{ref}/{path}
//        -> https://gitlab.com/{group}/{project}/-/raw/{ref}/{path}

const GITHUB_BLOB = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i;
const GITLAB_BLOB = /^https?:\/\/(?:www\.)?gitlab\.com\/(.+?)\/-\/blob\/([^/]+)\/(.+)$/i;

// The raw twin of a blob URL, or null when the URL is not a blob on a host we know.
function rawUrlFor(url) {
  const s = String(url == null ? '' : url).trim();
  if (!s) return null;

  const gh = GITHUB_BLOB.exec(s);
  if (gh) {
    const [, owner, repo, ref, path] = gh;
    return {
      host: 'github',
      path,
      rawUrl: 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + ref + '/' + path,
    };
  }

  const gl = GITLAB_BLOB.exec(s);
  if (gl) {
    const [, group, ref, path] = gl;
    return {
      host: 'gitlab',
      path,
      rawUrl: 'https://gitlab.com/' + group + '/-/raw/' + ref + '/' + path,
    };
  }

  return null;
}

// How much of a remote file we are willing to hold in memory. A blob URL gives no size
// up front, and a preview needs a window, not a repository.
const MAX_REMOTE_CHARS = 2 * 1024 * 1024;

// Fetch a URL as text. Never throws: the caller renders an error message instead, and a
// preview that fails should say why rather than take the editor down with it.
//
// `obsidian` is required lazily so this module's pure half stays testable in plain Node.
async function fetchText(url, maxChars) {
  const cap = maxChars == null ? MAX_REMOTE_CHARS : maxChars;
  let requestUrl;
  try {
    ({ requestUrl } = require('obsidian'));
  } catch (e) {
    return { ok: false, text: '', error: 'requestUrl unavailable: ' + (e && e.message ? e.message : e) };
  }
  try {
    const res = await requestUrl({ url, throw: false });
    // A missing status is not a status of 0 and not a success — it means the response
    // could not be judged, and that is what the panel should say. fetchSection (web.js)
    // answers the same way, so both fetch paths speak one status language.
    const status = res && typeof res.status === 'number' ? res.status : null;
    if (status === null) {
      return { ok: false, text: '', error: 'HTTP status unknown' };
    }
    if (status < 200 || status >= 300) {
      return { ok: false, text: '', error: 'HTTP ' + status };
    }
    let text = res && typeof res.text === 'string' ? res.text : '';
    if (text.length > cap) text = text.slice(0, cap);
    return { ok: true, text, error: '' };
  } catch (e) {
    return { ok: false, text: '', error: e && e.message ? e.message : String(e) };
  }
}

// Test seam: consumed only by test/ — kept so the tests can reach in without a // second entry point. Production code does not read these.
// (`MAX_REMOTE_CHARS` is the test-only seam; rawUrlFor and fetchText are the API.)
module.exports = { rawUrlFor, fetchText, MAX_REMOTE_CHARS };
