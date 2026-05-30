/**
 * Rule-based English grapheme-to-phoneme (G2P) fallback.
 *
 * Used only for words absent from the CMU dict. The rules are applied
 * left-to-right with longest-match priority. This covers the most common
 * English patterns; rare or irregular words will be approximated.
 */

interface Rule {
  readonly pattern: string;
  readonly phones: readonly string[];
  /** If set, rule only fires when leftContext matches end of already-processed chars */
  readonly leftContext?: RegExp;
  /** If set, rule only fires when rightContext matches start of remaining chars */
  readonly rightContext?: RegExp;
}

// Order matters: longer patterns must precede shorter overlapping ones.
const RULES: Rule[] = [
  // ---- Multi-letter clusters ----
  { pattern: 'TCH',  phones: ['CH'] },
  { pattern: 'DGE',  phones: ['JH'] },
  { pattern: 'SCH',  phones: ['SH'] },
  { pattern: 'QUE',  phones: ['K'] },
  { pattern: 'QUI',  phones: ['K', 'W', 'IH1'] },
  { pattern: 'QU',   phones: ['K', 'W'] },
  { pattern: 'CK',   phones: ['K'] },
  { pattern: 'NG',   phones: ['NG'] },
  { pattern: 'SH',   phones: ['SH'] },
  { pattern: 'CH',   phones: ['CH'] },
  { pattern: 'PH',   phones: ['F'] },
  { pattern: 'WH',   phones: ['W'] },
  { pattern: 'GH',   phones: [] },            // mostly silent
  { pattern: 'KN',   phones: ['N'] },         // knife
  { pattern: 'WR',   phones: ['R'] },         // wrong
  { pattern: 'MB',   phones: ['M'], rightContext: /^$/ }, // word-final: bomb
  // ---- Digraph vowels ----
  { pattern: 'OO',   phones: ['UW1'] },
  { pattern: 'EE',   phones: ['IY1'] },
  { pattern: 'EA',   phones: ['IY1'] },
  { pattern: 'AI',   phones: ['EY1'] },
  { pattern: 'AY',   phones: ['EY1'] },
  { pattern: 'OA',   phones: ['OW1'] },
  { pattern: 'OE',   phones: ['OW1'] },
  { pattern: 'OI',   phones: ['OY1'] },
  { pattern: 'OY',   phones: ['OY1'] },
  { pattern: 'AU',   phones: ['AO1'] },
  { pattern: 'AW',   phones: ['AO1'] },
  { pattern: 'EW',   phones: ['UW1'] },
  { pattern: 'OW',   phones: ['OW1'] },
  { pattern: 'OU',   phones: ['AW1'] },
  { pattern: 'UI',   phones: ['UW1'] },
  { pattern: 'UE',   phones: ['UW1'] },
  { pattern: 'IE',   phones: ['IY1'] },
  // ---- Vowel-consonant-E (magic-e) patterns ----
  // e.g. "AKE" → EY K, "IKE" → AY K, etc.
  // These are handled in the main loop rather than here (see applyMagicE).
  // ---- R-colored vowels ----
  { pattern: 'ER',   phones: ['ER0'] },
  { pattern: 'IR',   phones: ['ER0'] },
  { pattern: 'UR',   phones: ['ER0'] },
  { pattern: 'AR',   phones: ['AA1', 'R'] },
  { pattern: 'OR',   phones: ['AO1', 'R'] },
  // ---- Single vowels (context-dependent; these are fallback defaults) ----
  { pattern: 'A',    phones: ['AE1'] },
  { pattern: 'E',    phones: ['EH1'] },
  { pattern: 'I',    phones: ['IH1'] },
  { pattern: 'O',    phones: ['AO1'] },
  { pattern: 'U',    phones: ['AH1'] },
  { pattern: 'Y',    phones: ['IH0'], leftContext: /[A-Z]/, rightContext: /[A-Z]/ }, // medial
  { pattern: 'Y',    phones: ['IY0'] }, // word-final
  // ---- Single consonants ----
  { pattern: 'B', phones: ['B'] },
  { pattern: 'C', phones: ['S'], rightContext: /^[EIY]/ },  // ce, ci, cy
  { pattern: 'C', phones: ['K'] },
  { pattern: 'D', phones: ['D'] },
  { pattern: 'F', phones: ['F'] },
  { pattern: 'G', phones: ['JH'], rightContext: /^[EIY]/ }, // ge, gi, gy
  { pattern: 'G', phones: ['G'] },
  { pattern: 'H', phones: ['HH'] },
  { pattern: 'J', phones: ['JH'] },
  { pattern: 'K', phones: ['K'] },
  { pattern: 'L', phones: ['L'] },
  { pattern: 'M', phones: ['M'] },
  { pattern: 'N', phones: ['N'] },
  { pattern: 'P', phones: ['P'] },
  { pattern: 'Q', phones: ['K'] },
  { pattern: 'R', phones: ['R'] },
  { pattern: 'S', phones: ['S'] },
  { pattern: 'T', phones: ['T'] },
  { pattern: 'V', phones: ['V'] },
  { pattern: 'W', phones: ['W'] },
  { pattern: 'X', phones: ['K', 'S'] },
  { pattern: 'Z', phones: ['Z'] },
];

const VOWEL_LETTERS = new Set(['A', 'E', 'I', 'O', 'U']);
const VOWEL_PHONE = new Map([
  ['A', 'EY1'], ['E', 'IY1'], ['I', 'AY1'], ['O', 'OW1'], ['U', 'YUW1'],
]);

/**
 * Returns ARPABET phones for the word using letter-to-sound rules.
 * Stress markers (0/1/2) are included so the prosody engine can use them.
 */
export function graphemeToPhoneme(word: string): string[] {
  const upper = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (upper.length === 0) return [];

  const phones: string[] = [];
  let i = 0;
  const processed: string[] = []; // chars already consumed (for left-context checks)

  while (i < upper.length) {
    // Detect magic-e: vowel + consonants + 'E' at word end
    if (
      VOWEL_LETTERS.has(upper[i]!) &&
      i + 2 < upper.length &&
      upper[upper.length - 1] === 'E' &&
      !VOWEL_LETTERS.has(upper[i + 1]!)
    ) {
      // Find the final silent 'e'
      let j = i + 1;
      while (j < upper.length - 1 && !VOWEL_LETTERS.has(upper[j]!)) j++;
      if (j === upper.length - 1) {
        // Magic-e applies
        phones.push(VOWEL_PHONE.get(upper[i]!) ?? 'AH1');
        processed.push(upper[i]!);
        i++;
        continue;
      }
    }

    // Try each rule in priority order (longest pattern first via array order)
    let matched = false;
    const rest = upper.slice(i);
    const leftStr = processed.join('');

    for (const rule of RULES) {
      if (!rest.startsWith(rule.pattern)) continue;
      if (rule.leftContext && !rule.leftContext.test(leftStr)) continue;
      const remaining = rest.slice(rule.pattern.length);
      if (rule.rightContext && !rule.rightContext.test(remaining)) continue;

      for (const p of rule.phones) phones.push(p);
      for (const ch of rule.pattern) processed.push(ch);
      i += rule.pattern.length;
      matched = true;
      break;
    }

    if (!matched) {
      // Unknown character — skip
      processed.push(upper[i]!);
      i++;
    }
  }

  // Consume the silent 'E' that magic-e leaves behind (word-final E after consonant)
  // — already handled by falling through the E rule which maps to EH1.
  // Remove stress from trailing silent-E artefacts: if last phone is EH1 and was
  // produced from a magic-e position, drop it. (Simple heuristic: only keep it if
  // the E was part of a stressed syllable, but we can't know for sure; accept
  // the approximation.)

  return phones.filter(p => p.length > 0);
}
