import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DICT_PATH = join(__dirname, '../../data/cmudict.dict');

let dict: Map<string, string[][]> | null = null;

function loadDict(): Map<string, string[][]> {
  if (!existsSync(DICT_PATH)) {
    throw new Error(
      `CMU dict not found at ${DICT_PATH}.\nRun: pnpm run setup`,
    );
  }

  const raw = readFileSync(DICT_PATH, 'utf8');
  const map = new Map<string, string[][]>();

  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(';;;')) continue;

    // Lines look like: WORD  P1 P2 P3 ...
    // Alternates: WORD(2)  P1 P2 ...
    const spaceIdx = line.indexOf('  ');
    if (spaceIdx === -1) continue;

    const wordFull = line.slice(0, spaceIdx).toUpperCase();
    const phones = line.slice(spaceIdx + 2).trim().split(' ');

    // Strip alternate pronunciations suffix e.g. "WORD(2)"
    const word = wordFull.replace(/\(\d+\)$/, '');

    const existing = map.get(word);
    if (existing) {
      existing.push(phones);
    } else {
      map.set(word, [phones]);
    }
  }

  return map;
}

export function getDict(): Map<string, string[][]> {
  if (!dict) dict = loadDict();
  return dict;
}

/**
 * Look up a word and return its first pronunciation as an array of ARPABET
 * phonemes with stress markers, e.g. ["HH", "EH1", "L", "OW0"].
 * Returns null if the word is not in the dictionary.
 */
export function lookupWord(word: string): string[] | null {
  const entry = getDict().get(word.toUpperCase());
  if (!entry || entry.length === 0 || !entry[0]) return null;
  return entry[0];
}
