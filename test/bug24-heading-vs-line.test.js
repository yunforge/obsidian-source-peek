'use strict';

// bug24: `parseTarget("Note#L18")` read every local path with a `#L<n>` fragment as a line
// of a source file — including a vault note whose heading happens to be called `L18`. The
// panel then looked for a file named `Note`, did not find one, and showed "nothing at line
// 18". The fragment only means a line when the path names a source file.
//
// The first round of this fix decided that by "has a known code extension, or the path
// holds a slash". Both halves were wrong: a Makefile has no extension yet is source, and a
// dated note (`notes/meeting.2024-10-20`) holds a slash yet is a note. The rule is the
// extension of the basename, and nothing else — so the cases below are grouped by what the
// basename looks like, and each group pins one direction of the mistake.

const assert = require('assert/strict');
const { parseTarget, findTargets } = require('../src/parse');

function section(label, fn) {
  try {
    fn();
  } catch (err) {
    err.message = '[' + label + '] ' + err.message;
    throw err;
  }
}

const code = (path, from, to) => ({ kind: 'code', source: 'local', path, from, to: to == null ? from : to });

module.exports = {
  name: 'bug24: a #L fragment needs a source file, not a vault note',
  run() {
    section('a note whose heading is L18 is not a line of code', () => {
      assert.equal(parseTarget('Note#L18'), null, 'no extension: a note, whatever its heading');
      assert.equal(parseTarget('Note#L18-L23'), null, 'a range is still a heading');
      assert.equal(parseTarget('我的笔记#L18'), null, 'a Chinese note name is a note too');
      assert.equal(parseTarget('中文笔记名#L3'), null);
    });

    section('a note under a folder is still a note', () => {
      // The regression the slash rule caused: a dated or versioned note lives in a folder.
      assert.equal(parseTarget('notes/meeting.2024-10-20#L5'), null, 'a dated note');
      assert.equal(parseTarget('projects/v1.2#L5'), null, 'a versioned note');
      assert.equal(parseTarget('研究/会议.2024-10-20#L5'), null, 'a dated note with a Chinese name');
      assert.equal(parseTarget('archive/release.1.0-beta#L2'), null, 'a pre-release tag');
    });

    section('a dotfile name is a note, not a source file', () => {
      // `extOf('.env')` is '' by the same rule as `extOf('Makefile')`, but the vault holds a
      // note called `.env` all the time, and `.gitignore` is a documented dotfile name. Both
      // are names rather than source files, so `#L3` is a heading.
      assert.equal(parseTarget('.env#L3'), null, 'a dotfile with no second dot');
      assert.equal(parseTarget('.gitignore#L3'), null);
      assert.equal(parseTarget('config/.env.local#L3'), null, 'a dotfile with an extra dot is an unknown extension');
    });

    section('the reported cases stay fixed', () => {
      assert.equal(parseTarget('Note'), null, 'no fragment, no target');
      assert.equal(parseTarget('Note.md'), null);
      assert.equal(parseTarget('Note#Heading'), null, 'a plain heading');
      assert.equal(parseTarget('assets/img.png'), null, 'png is not code, and has no line');
    });

    section('a real code link is still a code link', () => {
      assert.deepEqual(parseTarget('app.js#L18'), code('app.js', 18));
      assert.deepEqual(parseTarget('Note.md#L18'), code('Note.md', 18), '.md is a target in this plugin');
      assert.deepEqual(parseTarget('../src/main.c#L18'), code('../src/main.c', 18));
      assert.deepEqual(parseTarget('docs/a.md#L5'), code('docs/a.md', 5), 'unchanged from the baseline');
      assert.deepEqual(parseTarget('a/b/main.c#L18-23'), code('a/b/main.c', 18, 23));
      assert.deepEqual(parseTarget('C:\\dir\\main.js#L18'), code('C:\\dir\\main.js', 18), 'windows path');
      assert.deepEqual(parseTarget('index.html#L4'), code('index.html', 4));
    });

    section('a source file with no extension is still a code link', () => {
      // The regression the "known extension only" rule caused. `Makefile` and `Dockerfile`
      // are in the name list because `extOf` puts them in the same bucket as `Note`, which
      // test/code.test.js:24,60 already treats as source (`extOf` -> '', `langFor` -> clike).
      assert.deepEqual(parseTarget('Makefile#L18'), code('Makefile', 18), 'a Makefile is source');
      assert.deepEqual(parseTarget('Dockerfile#L12'), code('Dockerfile', 12));
      assert.deepEqual(parseTarget('scripts/build#L3'), code('scripts/build', 3), 'a script with no extension');
      assert.deepEqual(parseTarget('Makefile#l18'), code('Makefile', 18), 'lower-case l is the same fragment');
      assert.equal(parseTarget('Makefile'), null, 'no fragment is still not a target');
    });

    section('a name that is not on the list is read as a note', () => {
      // The list is the decision, and it has to be a short one: a vault is full of notes
      // called README, and a line reference to one would be the original bug again.
      assert.equal(parseTarget('README#L1'), null);
      assert.equal(parseTarget('Notes/Some note#L18'), null, 'a note keeps its name in a folder');
      assert.equal(parseTarget('Daily Notes/2024-10-20#L2'), null);
    });

    section('an autolink is judged the same way as its destination', () => {
      const src = findTargets('see <Makefile#L18> now');
      assert.equal(src.length, 1);
      assert.deepEqual(src[0].target, code('Makefile', 18));
      assert.deepEqual(findTargets('see <Note#L18> now'), [], 'a note heading is not a target');
      assert.deepEqual(findTargets('see [x](notes/meeting.2024-10-20#L5) now'), [], 'nor is a dated note');
    });
  },
};
