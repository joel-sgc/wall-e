/**
 * Wall-E voice parameters — eSpeak-ng backend edition.
 *
 * Research finding: Wall-E's voice is Ben Burtt's own voice processed through
 * Kyma TAU (PSOLA resynthesis), not synthesized from phoneme rules. We
 * approximate this with eSpeak-ng (a mature formant synthesizer that already
 * has the right electronic character) and layer Wall-E-specific effects on top.
 *
 * Voice 'en+anikaRobot': pitch range 200–300 Hz, voicing amplitude 30%,
 * built-in echo — the closest eSpeak variant to Wall-E's register.
 * Post-processing: FM vibrato → electronic noise texture → comb doubling → echo.
 */
export const WALL_E_VOICE = {
  // eSpeak-ng synthesis parameters
  // en+walle: custom voice (tts/data/walle-voice) — Klatt 5, formants shifted
  // +15-35% (toy/small-cavity quality), roughness 22, natural intonation.
  espeakVoice: 'en+walle',
  espeakPitch: 90, // 0-99; combined with voice's 'pitch 200 380' → ~330-360 Hz
  espeakSpeed: 1, // WPM — default 175; lower = longer phonemes, more "drag" on each word
  espeakWordGap: 1, // units of 10 ms between words → 140 ms gap
  espeakAmplitude: 100,

  // OLA time-stretch applied after eSpeak (1.0 = off, 1.5 = 50% longer words)
  // eSpeak's speed floor is ~80 WPM regardless of espeakSpeed; this goes further.
  timeStretch: 1.6,

  // FM vibrato — metronomic electronic oscillator feel
  vibratoRate: 4.5, // Hz
  vibratoDepth: 0.013,

  // Electronic noise texture following amplitude envelope
  noiseLevel: 0.07,

  // Soft-clip distortion — the buzzy electronic quality Wall-E's voice has
  distortionDrive: 2.2,

  // Comb-filter doubling
  doublingDelayMs: 8,
  doublingMix: 0.38,

  // Short echo — metallic chassis resonance
  echoDelayMs: 26,
  echoFeedback: 0.16,
  echoWet: 0.2,
} as const;

export type WallEVoiceParams = typeof WALL_E_VOICE;
