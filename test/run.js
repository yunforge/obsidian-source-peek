'use strict';

// Self-contained, zero-dependency test runner.
//
//   node test/run.js           run every test/*.test.js in this directory
//   node test/run.js --core    run only the core whitelist below
//
// Every *.test.js here exports { name, run }. `run()` takes no arguments and signals
// failure by throwing (assert does that for us); it may also be async, so it is awaited —
// a rejected promise is a failure, not a silent pass.
//
// This file deliberately requires nothing from src/ or obsidian, so it keeps working in a
// plain Node process with no app stubs. That is also why a test file which fails to
// *load* is reported as a failure rather than crashing the whole run.

const fs = require('fs');
const path = require('path');

// The tests a quick check must never skip. Everything else may depend on fixtures or an
// environment this runner does not set up, so `--core` leaves it out.
const CORE = ['parse.test.js', 'remote.test.js', 'code.test.js', 'web.test.js'];

const coreOnly = process.argv.slice(2).includes('--core');

const dir = __dirname;
let files = fs.readdirSync(dir).filter((n) => n.endsWith('.test.js')).sort();

if (coreOnly) files = files.filter((n) => CORE.includes(n));

if (!files.length) {
  console.error(coreOnly ? 'No core *.test.js files found' : 'No *.test.js files found');
  process.exit(1);
}

async function main() {
  const passed = [];
  const failed = [];

  for (const file of files) {
    let mod;
    try {
      mod = require(path.join(dir, file));
    } catch (err) {
      // A missing fixture or a syntax error is a failure of this suite, not a reason to
      // abandon the tests that do work.
      failed.push({ name: file + ' (load)', err });
      continue;
    }
    if (!mod || typeof mod.run !== 'function') {
      failed.push({ name: (mod && mod.name) || file, err: new Error(file + ' must export { name, run }') });
      continue;
    }
    try {
      await mod.run();
      passed.push(mod.name || file);
    } catch (err) {
      failed.push({ name: mod.name || file, err });
    }
  }

  for (const name of passed) console.log('ok   ' + name);

  if (failed.length) {
    console.log('');
    for (const f of failed) {
      console.error('FAIL ' + f.name);
      console.error((f.err && f.err.stack) || String(f.err));
      console.error('');
    }
    console.error(failed.length + ' failed, ' + passed.length + ' passed');
    process.exit(1);
  }

  console.log('');
  console.log(passed.length + ' passed');
  process.exit(0);
}

main();
