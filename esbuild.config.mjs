import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Build the plugin: bundle src/ into main.js and assemble styles.css, both at the
// repository root where Obsidian looks for them.
//
// Self-contained on purpose. The plugin used to share a git submodule with three sibling
// plugins, and its build script lived inside that submodule — so an un-initialised clone
// could not build at all. Nothing here reaches outside this repository.

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const banner = `/* ${manifest.name} ${pkg.version} — bundled from src/ by esbuild. Do not edit directly; edit src/ and run "npm run build". */`;

// Where to copy the built files after a successful build — a test vault's plugin folder.
// Local-only, so the path is not committed.
let deployTargets = [];
try {
  ({ deployTargets = [] } = await import('./esbuild.local.mjs'));
} catch {
  /* no local config: nothing to deploy to */
}

// A failed build throws (esbuild's own behaviour — warnings do not stop it, errors do),
// so there is no result to inspect afterwards: reaching this line means it succeeded.
await esbuild.build({
  entryPoints: [path.join(root, 'src', 'main.js')],
  outfile: path.join(root, 'main.js'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2018',
  // Supplied by the Obsidian runtime, never bundled.
  external: ['obsidian', 'electron', '@codemirror/view', '@codemirror/state', '@codemirror/language'],
  banner: { js: banner },
  logLevel: 'info',
});

// styles.css is generated too, so it carries the same version stamp and cannot drift from
// the build that produced it.
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const cssBanner = `/* ${manifest.name} ${pkg.version} — assembled from src/styles.css by "npm run build". Do not edit directly. */\n`;
fs.writeFileSync(path.join(root, 'styles.css'), cssBanner + css);

for (const target of deployTargets) {
  const dir = path.resolve(target);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  console.log('deployed to ' + dir);
}
