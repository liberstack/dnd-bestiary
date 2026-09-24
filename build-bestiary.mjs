/**
 * build-bestiary.mjs
 * Baixa todas as criaturas da D&D 5e API (via api.js) e grava data/bestiary.json.
 * Uso: node build-bestiary.mjs   (Node 18 ou mais novo)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fetchAllMonsters } from './api.js';

const dataDir = new URL('./data/', import.meta.url);
const outFile = new URL('./bestiary.json', dataDir);

console.log('Buscando criaturas na D&D 5e API...');

const { monsters, failed, total } = await fetchAllMonsters({
  concurrency: 6,
  onProgress: (done, count) => process.stdout.write(`\r${done}/${count}`),
});
process.stdout.write('\n');

if (failed.length) {
  console.error(`Falharam ${failed.length} de ${total}: ${failed.join(', ')}`);
  console.error('Nada foi gravado. Rode de novo.');
  process.exit(1);
}

await mkdir(dataDir, { recursive: true });
await writeFile(outFile, JSON.stringify(monsters));
console.log(`Pronto: ${monsters.length} criaturas em data/bestiary.json`);
