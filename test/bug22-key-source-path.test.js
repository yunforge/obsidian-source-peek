'use strict';

// bug22: `keyFor` built its identity from the link text alone. Two notes linking the same
// relative path — `../src/a.c` from `notes/one.md` and from `notes/two.md` — are two
// different files, but they got one key, so the popover's same-key early return kept the
// panel the first note had built and showed it for the second.
//
// The key now carries the note the link sits in. Web keys get the opposite treatment: a
// trailing slash and the host's letter case are the same page, so those spellings share an
// identity — the one labelFor had always displayed, and now keys by too.

const assert = require('assert/strict');
const { keyFor, labelFor, Preview } = require('../src/preview');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

const local = (path) => ({ kind: 'code', source: 'local', path, from: 18, to: 18 });
const web = (url) => ({ kind: 'web', url, heading: '' });

module.exports = {
  name: 'bug22: a link\'s key knows which note it sits in, and identical pages share one',
  run() {
    section('the same relative link in two notes is two identities', () => {
      const a = keyFor(local('../src/a.c'), 'notes/one.md');
      const b = keyFor(local('../src/a.c'), 'notes/two.md');
      assert.notEqual(a, b, 'same spelling, different notes — must not share a panel');
      assert.equal(a, keyFor(local('../src/a.c'), 'notes/one.md'), 'same note, same identity');
    });

    section('different relative spellings from the same note stay distinct', () => {
      assert.notEqual(keyFor(local('./a.c'), 'n.md'), keyFor(local('lib/a.c'), 'n.md'));
      assert.notEqual(keyFor(local('../a.c'), 'n.md'), keyFor(local('../a.c'), 'other/n.md'));
    });

    section('a web page with or without its trailing slash is one identity', () => {
      assert.equal(keyFor(web('https://x.com/a')), keyFor(web('https://x.com/a/')));
      assert.equal(keyFor(web('https://x.com/')), keyFor(web('https://x.com')));
      assert.notEqual(keyFor(web('https://x.com/a')), keyFor(web('https://x.com/b')));
    });

    section('the host\'s letter case does not split a page', () => {
      assert.equal(keyFor(web('https://GitHub.com/o/r')), keyFor(web('https://github.com/o/r')));
      // Path case is meaningful: /A and /a are different pages.
      assert.notEqual(keyFor(web('https://x.com/A')), keyFor(web('https://x.com/a')));
    });

    section('labelFor displays the identity it keys by', () => {
      assert.equal(labelFor(web('https://x.com/a/')), labelFor(web('https://x.com/a')));
      assert.equal(labelFor(web('https://GitHub.com/o/r/')), 'github.com/o/r');
      assert.equal(labelFor({ kind: 'web', url: 'https://x.com/a', heading: 'Install' }), 'x.com/a#Install');
      assert.equal(labelFor(local('../src/a.c')), '../src/a.c:18');
      assert.equal(labelFor({ kind: 'code', source: 'local', path: 'a.c', from: 1, to: 9 }), 'a.c:1-9');
    });

    section('end to end: the popover sees two keys for two notes', () => {
      // Through the real Preview and Popover wiring: the second note's hover must not hit
      // the same-key early return the first note's panel left behind.
      const plugin = { settings: {} };
      const preview = new Preview(plugin);
      const keys = [];
      const realSchedule = preview.pop.schedule.bind(preview.pop);
      preview.pop.schedule = (key, x, y, build) => { keys.push(key); realSchedule(key, x, y, build); };
      try {
        preview.schedule(local('../src/a.c'), 'notes/one.md', 10, 10);
        assert.ok(preview.pop.pending, 'first hover is pending');
        preview.schedule(local('../src/a.c'), 'notes/two.md', 10, 10);
        assert.equal(keys.length, 2, 'the second note schedules its own panel');
        assert.notEqual(keys[0], keys[1], 'and its key is not the first note\'s');
      } finally {
        preview.destroy();
      }
    });
  },
};
