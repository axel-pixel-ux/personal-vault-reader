import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// Tout reste externe (installé via node_modules) sauf nodemailer, embarqué dans le bundle :
// la VM ne reconstruit pas l'image Docker, elle monte simplement dist/.
const BUNDLED = new Set(['nodemailer']);
const external = Object.keys({ ...pkg.dependencies }).filter((d) => !BUNDLED.has(d));

await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/server.js',
  external,
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
