#!/usr/bin/env node
/**
 * Downloads the CMU Pronouncing Dictionary (cmudict.dict) from the official
 * CMU Sphinx repository and caches it in tts/data/.
 *
 * Run once:  pnpm run setup
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '../data');
const DICT_PATH = join(DATA_DIR, 'cmudict.dict');

const CMU_URL =
  'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';

async function download(): Promise<void> {
  if (existsSync(DICT_PATH)) {
    console.log(`CMU dict already present at: ${DICT_PATH}`);
    console.log('Delete it and re-run to refresh.');
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });

  console.log(`Downloading CMU Pronouncing Dictionary from:\n  ${CMU_URL}\n`);

  const res = await fetch(CMU_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();
  writeFileSync(DICT_PATH, text, 'utf8');

  const lines = text.split('\n').filter(l => l && !l.startsWith(';;;')).length;
  console.log(`Saved ${lines.toLocaleString()} entries to:\n  ${DICT_PATH}`);
  console.log('\nSetup complete — run: pnpm speak "Wall-E!"');
}

download().catch(err => {
  console.error('Download failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
