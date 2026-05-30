import type { FormantData } from '../synthesis/types.js';

export type PhonemeClass =
  | 'vowel'
  | 'diphthong'
  | 'voiced-fricative'
  | 'unvoiced-fricative'
  | 'voiced-stop'
  | 'unvoiced-stop'
  | 'nasal'
  | 'approximant'
  | 'affricate'
  | 'silence';

export interface PhonemeParams {
  readonly class: PhonemeClass;
  /** Nominal duration in ms at 1× tempo */
  readonly duration: number;
  readonly voiced: boolean;
  /** Cascade formant filter target (vowels, nasals, approximants, voiced fricatives) */
  readonly formants?: FormantData;
  /** End formant for diphthong interpolation */
  readonly diphthongEnd?: FormantData;
  /** Noise band Hz for fricatives and stop bursts */
  readonly noiseFreqLow?: number;
  readonly noiseFreqHigh?: number;
  /** Noise amplitude relative to voiced component */
  readonly noiseGain?: number;
  /** Duration of stop burst in ms */
  readonly burstDuration?: number;
  /** Closure silence duration in ms (for stops, before burst) */
  readonly closureDuration?: number;
}

// ---------------------------------------------------------------------------
// Formant data – Wall-E parameters
//
// Based on classic Klatt (1980) cascade synthesis values for a male speaker,
// then modified for Wall-E's voice:
//   • Bandwidths narrowed by ~30% (sharper resonances = more "electronic")
//   • Pitch is set separately at ~350 Hz base (handled in voice layer)
// ---------------------------------------------------------------------------

// Bandwidths widened to 80–170 Hz so the harmonic grid of a 210 Hz
// fundamental can reliably excite each formant (spacing = 210 Hz;
// a 210 Hz-wide ±3 dB window guarantees at least one harmonic lands
// within every formant if B ≥ ~105 Hz — we use 80–170 to balance
// "robotic" sharpness with actual vowel intelligibility).
const V: Record<string, FormantData> = {
  IY: { f1: 270,  f2: 2290, f3: 3010, b1: 80,  b2: 100, b3: 150 }, // beat
  IH: { f1: 390,  f2: 1990, f3: 2550, b1: 80,  b2: 105, b3: 155 }, // bit
  EH: { f1: 530,  f2: 1840, f3: 2480, b1: 85,  b2: 110, b3: 160 }, // bet
  AE: { f1: 660,  f2: 1720, f3: 2410, b1: 90,  b2: 115, b3: 165 }, // bat
  AA: { f1: 730,  f2: 1090, f3: 2440, b1: 90,  b2: 115, b3: 165 }, // father
  AO: { f1: 570,  f2:  840, f3: 2410, b1: 85,  b2: 110, b3: 160 }, // caught
  UH: { f1: 440,  f2: 1020, f3: 2240, b1: 85,  b2: 110, b3: 160 }, // book
  UW: { f1: 300,  f2:  870, f3: 2240, b1: 80,  b2: 100, b3: 150 }, // boot
  AH: { f1: 520,  f2: 1190, f3: 2390, b1: 88,  b2: 112, b3: 162 }, // but
  ER: { f1: 490,  f2: 1350, f3: 1690, b1: 90,  b2: 120, b3: 170 }, // bird
};

export const VOWEL_FORMANTS: Readonly<Record<string, FormantData>> = V;

const N: Record<string, FormantData> = {
  M:  { f1: 250, f2:  950, f3: 2200, b1: 100, b2: 200, b3: 300 },
  N:  { f1: 250, f2: 1100, f3: 2400, b1: 100, b2: 200, b3: 300 },
  NG: { f1: 250, f2:  900, f3: 2100, b1: 100, b2: 200, b3: 300 },
};

const A: Record<string, FormantData> = {
  L: { f1: 310, f2: 1050, f3: 2880, b1: 85, b2: 110, b3: 155 },
  R: { f1: 460, f2: 1270, f3: 1830, b1: 85, b2: 110, b3: 155 },
  W: { f1: 300, f2:  610, f3: 2200, b1: 90, b2: 115, b3: 160 },
  Y: { f1: 250, f2: 2100, f3: 3200, b1: 85, b2: 110, b3: 155 },
};

// Voiced fricative base formants (mixed source: voiced buzz + noise)
const VF: Record<string, FormantData> = {
  V:  { f1: 280, f2:  900, f3: 2300, b1: 120, b2: 200, b3: 300 },
  DH: { f1: 280, f2:  900, f3: 2300, b1: 120, b2: 200, b3: 300 },
  Z:  { f1: 280, f2:  900, f3: 2300, b1: 120, b2: 200, b3: 300 },
  ZH: { f1: 280, f2:  900, f3: 2300, b1: 120, b2: 200, b3: 300 },
};

export const PHONEME_PARAMS: Readonly<Record<string, PhonemeParams>> = {
  // Vowels
  IY:  { class: 'vowel',              voiced: true,  duration: 120, formants: V.IY },
  IH:  { class: 'vowel',              voiced: true,  duration: 100, formants: V.IH },
  EH:  { class: 'vowel',              voiced: true,  duration: 100, formants: V.EH },
  AE:  { class: 'vowel',              voiced: true,  duration: 120, formants: V.AE },
  AA:  { class: 'vowel',              voiced: true,  duration: 130, formants: V.AA },
  AO:  { class: 'vowel',              voiced: true,  duration: 130, formants: V.AO },
  UH:  { class: 'vowel',              voiced: true,  duration: 100, formants: V.UH },
  UW:  { class: 'vowel',              voiced: true,  duration: 120, formants: V.UW },
  AH:  { class: 'vowel',              voiced: true,  duration: 100, formants: V.AH },
  ER:  { class: 'vowel',              voiced: true,  duration: 130, formants: V.ER },

  // Diphthongs — formants linearly interpolate from .formants → .diphthongEnd
  AW:  { class: 'diphthong', voiced: true, duration: 200, formants: V.AA, diphthongEnd: V.UW },
  AY:  { class: 'diphthong', voiced: true, duration: 200, formants: V.AA, diphthongEnd: V.IY },
  EY:  { class: 'diphthong', voiced: true, duration: 180, formants: V.EH, diphthongEnd: V.IY },
  OW:  { class: 'diphthong', voiced: true, duration: 200, formants: V.AO, diphthongEnd: V.UW },
  OY:  { class: 'diphthong', voiced: true, duration: 200, formants: V.AO, diphthongEnd: V.IY },

  // Nasals
  M:   { class: 'nasal',     voiced: true,  duration: 80, formants: N.M  },
  N:   { class: 'nasal',     voiced: true,  duration: 70, formants: N.N  },
  NG:  { class: 'nasal',     voiced: true,  duration: 70, formants: N.NG },

  // Approximants
  L:   { class: 'approximant', voiced: true, duration: 80, formants: A.L },
  R:   { class: 'approximant', voiced: true, duration: 80, formants: A.R },
  W:   { class: 'approximant', voiced: true, duration: 70, formants: A.W },
  Y:   { class: 'approximant', voiced: true, duration: 60, formants: A.Y },

  // Voiced fricatives — low-level buzz mixed with bandpass noise
  V:   { class: 'voiced-fricative', voiced: true,  duration: 90,  formants: VF.V,
         noiseFreqLow: 300,  noiseFreqHigh: 3000,  noiseGain: 0.55 },
  DH:  { class: 'voiced-fricative', voiced: true,  duration: 70,  formants: VF.DH,
         noiseFreqLow: 100,  noiseFreqHigh: 2000,  noiseGain: 0.45 },
  Z:   { class: 'voiced-fricative', voiced: true,  duration: 90,  formants: VF.Z,
         noiseFreqLow: 3500, noiseFreqHigh: 8000,  noiseGain: 0.65 },
  ZH:  { class: 'voiced-fricative', voiced: true,  duration: 90,  formants: VF.ZH,
         noiseFreqLow: 2000, noiseFreqHigh: 6000,  noiseGain: 0.55 },

  // Unvoiced fricatives — pure bandpass noise
  F:   { class: 'unvoiced-fricative', voiced: false, duration: 100,
         noiseFreqLow: 5000, noiseFreqHigh: 10000, noiseGain: 0.80 },
  TH:  { class: 'unvoiced-fricative', voiced: false, duration: 90,
         noiseFreqLow:  500, noiseFreqHigh:  3000,  noiseGain: 0.60 },
  S:   { class: 'unvoiced-fricative', voiced: false, duration: 100,
         noiseFreqLow: 3500, noiseFreqHigh:  9000,  noiseGain: 0.90 },
  SH:  { class: 'unvoiced-fricative', voiced: false, duration: 100,
         noiseFreqLow: 2000, noiseFreqHigh:  7000,  noiseGain: 0.80 },
  HH:  { class: 'unvoiced-fricative', voiced: false, duration: 80,
         noiseFreqLow:  500, noiseFreqHigh:  4000,  noiseGain: 0.50 },

  // Voiced stops — closure silence + short burst with some voiced leak
  B:   { class: 'voiced-stop', voiced: true,  duration: 80, closureDuration: 55,
         burstDuration: 12, noiseFreqLow:  800, noiseFreqHigh: 2000, noiseGain: 0.70 },
  D:   { class: 'voiced-stop', voiced: true,  duration: 80, closureDuration: 55,
         burstDuration: 12, noiseFreqLow: 2000, noiseFreqHigh: 5000, noiseGain: 0.70 },
  G:   { class: 'voiced-stop', voiced: true,  duration: 80, closureDuration: 55,
         burstDuration: 12, noiseFreqLow: 1000, noiseFreqHigh: 3000, noiseGain: 0.70 },

  // Unvoiced stops — full closure silence + louder burst
  P:   { class: 'unvoiced-stop', voiced: false, duration: 85, closureDuration: 60,
         burstDuration: 15, noiseFreqLow:  800, noiseFreqHigh: 2500, noiseGain: 0.90 },
  T:   { class: 'unvoiced-stop', voiced: false, duration: 85, closureDuration: 60,
         burstDuration: 15, noiseFreqLow: 2500, noiseFreqHigh: 7000, noiseGain: 0.90 },
  K:   { class: 'unvoiced-stop', voiced: false, duration: 85, closureDuration: 60,
         burstDuration: 15, noiseFreqLow: 1500, noiseFreqHigh: 4000, noiseGain: 0.85 },

  // Affricates
  CH:  { class: 'affricate', voiced: false, duration: 120, closureDuration: 30,
         burstDuration: 20, noiseFreqLow: 2500, noiseFreqHigh: 7000, noiseGain: 0.90 },
  JH:  { class: 'affricate', voiced: true,  duration: 120, closureDuration: 30,
         burstDuration: 20, noiseFreqLow: 2000, noiseFreqHigh: 6000, noiseGain: 0.70 },

  // Silence token (inter-word pause — duration overridden at runtime)
  SIL: { class: 'silence', voiced: false, duration: 60 },
};

/** Strip stress digits from an ARPABET phoneme (e.g. "AH1" → "AH"). */
export function stripStress(phone: string): string {
  return phone.replace(/[012]$/, '');
}

/** Extract stress digit: 1 = primary, 2 = secondary, 0 = unstressed. */
export function getStress(phone: string): 0 | 1 | 2 {
  const m = phone.match(/([012])$/);
  if (!m || !m[1]) return 0;
  return parseInt(m[1], 10) as 0 | 1 | 2;
}
