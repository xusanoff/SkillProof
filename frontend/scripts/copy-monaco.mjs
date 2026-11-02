// Monaco is served from our own origin (/monaco/vs): no CDN, works offline and under a strict CSP.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/monaco-editor/min/vs');
const to = resolve(root, 'public/monaco/vs');
if (!existsSync(from)) {
  console.error('monaco-editor is not installed: run pnpm install');
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
mkdirSync(dirname(to), { recursive: true });
cpSync(from, to, { recursive: true });
