import { lookupWord } from './cmudict.js';
import { graphemeToPhoneme } from './g2p.js';
import { stripStress, getStress } from './arpabet.js';

export type SentenceType = 'statement' | 'question' | 'exclamation';

export interface PhonemeToken {
  phone: string;        // bare ARPABET, e.g. "AH"
  stress: 0 | 1 | 2;   // 0 = none, 1 = primary, 2 = secondary
  /** True for the last phoneme of a word (used for inter-word pauses) */
  wordEnd: boolean;
  /** True for the last phoneme of the final word in a sentence */
  sentenceEnd: boolean;
}

export interface ParsedText {
  tokens: PhonemeToken[];
  sentenceType: SentenceType;
}

// Words that Wall-E says very distinctively — pronunciation overrides
const SPECIAL_PRONUNCIATIONS: Readonly<Record<string, string[]>> = {
  'WALL-E': ['W', 'AO1', 'L', 'IY1'],
  'WALLE':  ['W', 'AO1', 'L', 'IY1'],
  'EVA':    ['IY1', 'V', 'AH0'],
  'EVE':    ['IY1', 'V'],
  'DIRECTIVE': ['D', 'AH0', 'R', 'EH1', 'K', 'T', 'IH0', 'V'],
};

/** Map a raw word to an array of ARPABET tokens with stress. */
function wordToPhones(raw: string): Array<{ phone: string; stress: 0 | 1 | 2 }> {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9'-]/g, '');
  if (!cleaned) return [];

  const special = SPECIAL_PRONUNCIATIONS[cleaned];
  const phones: string[] = special ?? lookupWord(cleaned) ?? graphemeToPhoneme(cleaned);

  return phones.map(p => ({
    phone: stripStress(p),
    stress: getStress(p),
  }));
}

/**
 * Detect the type of a sentence from its punctuation.
 * Defaults to 'statement'.
 */
function detectSentenceType(text: string): SentenceType {
  const trimmed = text.trim();
  if (trimmed.endsWith('!')) return 'exclamation';
  if (trimmed.endsWith('?')) return 'question';
  return 'statement';
}

/** Expand simple digit sequences and common abbreviations. */
function expandText(text: string): string {
  return text
    .replace(/\bMR\b/gi, 'mister')
    .replace(/\bMRS\b/gi, 'missus')
    .replace(/\bDR\b/gi, 'doctor')
    .replace(/\d+/g, n => expandNumber(parseInt(n, 10)));
}

function expandNumber(n: number): string {
  if (n === 0) return 'zero';
  if (n < 0)   return 'negative ' + expandNumber(-n);

  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
                 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  if (n < 20)   return ones[n]!;
  if (n < 100)  return tens[Math.floor(n / 10)]! + (n % 10 ? '-' + ones[n % 10]! : '');
  if (n < 1000) return ones[Math.floor(n / 100)]! + ' hundred' + (n % 100 ? ' ' + expandNumber(n % 100) : '');
  return n.toString(); // good enough for large numbers
}

/**
 * Convert a full text string to a sequence of phoneme tokens.
 * Each sentence is parsed separately so the prosody engine can see
 * sentence boundaries.
 */
export function textToPhones(text: string): ParsedText {
  const expanded = expandText(text);
  const sentenceType = detectSentenceType(expanded);

  // Split on whitespace/hyphens, strip punctuation from individual tokens
  const words = expanded
    .split(/[\s\-–—]+/)
    .map(w => w.replace(/[^A-Za-z0-9']/g, ''))
    .filter(w => w.length > 0);

  const tokens: PhonemeToken[] = [];

  for (let wi = 0; wi < words.length; wi++) {
    const word = words[wi]!;
    const isLastWord = wi === words.length - 1;
    const phoneEntries = wordToPhones(word);

    for (let pi = 0; pi < phoneEntries.length; pi++) {
      const isLastPhone = pi === phoneEntries.length - 1;
      tokens.push({
        phone: phoneEntries[pi]!.phone,
        stress: phoneEntries[pi]!.stress,
        wordEnd: isLastPhone,
        sentenceEnd: isLastPhone && isLastWord,
      });
    }
  }

  return { tokens, sentenceType };
}
