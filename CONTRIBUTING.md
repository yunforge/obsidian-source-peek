# Contributing

Thanks for taking an interest. Bug reports and pull requests are welcome.

## Reporting bugs

Open an issue. For a bug, say which Obsidian version you're on, what the link looked like,
and what you expected to see. A link that reproduces it is the most useful thing you can
include.

## Building

```sh
npm install      # once, installs esbuild
npm run build    # bundle src/ -> main.js, assemble styles.css
npm test         # run every test
```

`main.js` and `styles.css` are generated. Edit the modules in `src/` and rebuild — don't
edit the built files by hand.

CI builds, runs the full test suite, and then verifies that the committed `main.js` and
`styles.css` match a fresh build. So a change to `src/` has to arrive together with the
rebuilt artifacts, or the check fails. That check exists because a stale bundle is the one
mistake nobody can see locally.

## The shape of the code

The plugin is deliberately small, and the seams are where the tests are:

- **`parse.js`** turns link text into a target. Pure, no I/O — this is where the link
  grammar lives, and where a new syntax belongs.
- **`code.js`**, **`remote.js`**, **`web.js`** each get one thing: lines off disk, files off
  a repository, HTML into blocks. Each keeps its pure part free of I/O so it can be tested
  without an editor or a network.
- **`preview.js`** is the only place that knows how a target becomes what the reader sees.
- **`popover.js`** is the shell — timing, placement, and the guard that stops a slow build
  from landing on top of a newer one.

Two rules keep the tests runnable outside Obsidian, and both matter:

1. **Require `obsidian` lazily.** A module that needs it at load time cannot be required by
   a test. `remote.js`, `web.js` and `render.js` require it inside the function that needs
   it.
2. **Keep the pure parts pure.** If a function's answer depends only on its arguments, it
   can be tested directly and it will stay honest.

## Tests

`npm test` runs everything; `npm run test:core` runs the whitelist in `test/run.js`. There
is no framework: each `test/*.test.js` exports `{ name, run }`, and `run()` signals failure
by throwing. `run()` may be async — the runner awaits it, so a rejected promise is a
failure rather than a silent pass.

A test that does not fail when the code is broken is worse than no test. When you add one,
break the thing it covers and check that it goes red.

## Pull requests

- Keep changes focused, and rebuild before committing so `main.js` and `styles.css` match
  `src/`.
- Match the surrounding style: small CommonJS modules, comments that explain why rather
  than what.
- Describe what changed and why in the PR.
