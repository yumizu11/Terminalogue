import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '../src/terminalogue.css');
const to = resolve(here, '../dist/terminalogue.css');

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log(`[terminalogue] copied ${from} -> ${to}`);
