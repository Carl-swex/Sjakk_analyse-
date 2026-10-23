// Copies the single-threaded lite Stockfish WASM build into public/ so Vite serves it as-is.
import { copyFileSync, mkdirSync } from 'node:fs';

const src = 'node_modules/stockfish/bin';
const dest = 'public/stockfish';
mkdirSync(dest, { recursive: true });
for (const ext of ['js', 'wasm']) {
  copyFileSync(`${src}/stockfish-19-lite-single.${ext}`, `${dest}/stockfish.${ext}`);
}
console.log('Stockfish copied to', dest);
