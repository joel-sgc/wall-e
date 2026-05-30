import type { AudioBuffer } from '../synthesis/types.js';
import { speakToAudio } from '../espeak/caller.js';
import { toSSML, hasStandaloneE } from '../espeak/preprocess.js';
import { applyTimeStretch } from '../effects/time-stretch.js';
import { applyVibrato } from '../effects/vibrato.js';
import { applyNoiseTexture } from '../effects/noise-texture.js';
import { applyDoubling } from '../effects/doubling.js';
import { applyEcho } from '../effects/echo.js';
import { applySoftClip, normalizeAudio } from '../effects/distortion.js';
import { WALL_E_VOICE } from './wall-e-params.js';

/**
 * Full Wall-E synthesis pipeline:
 *   text → eSpeak-ng (phonemes + formants)
 *        → FM vibrato (metronomic oscillator quality)
 *        → electronic noise texture (Ben Burtt's "noise around the words")
 *        → comb-filter doubling (layered electronic texture)
 *        → short echo (metal chassis resonance)
 *        → normalize
 */
export function synthesize(text: string): AudioBuffer {
  const trimmed  = text.trim();
  const useSSML  = hasStandaloneE(trimmed);
  const input    = useSSML ? toSSML(trimmed) : trimmed;

  const raw = speakToAudio(input, {
    voice:     WALL_E_VOICE.espeakVoice,
    pitch:     WALL_E_VOICE.espeakPitch,
    speed:     WALL_E_VOICE.espeakSpeed,
    wordGap:   WALL_E_VOICE.espeakWordGap,
    amplitude: WALL_E_VOICE.espeakAmplitude,
    ssml:      useSSML,
  });

  if (raw.length === 0) return raw;

  const stretched = applyTimeStretch(raw, WALL_E_VOICE.timeStretch);
  const audio = applyVibrato(stretched, WALL_E_VOICE.vibratoRate, WALL_E_VOICE.vibratoDepth);

  applyNoiseTexture(audio, WALL_E_VOICE.noiseLevel);
  applySoftClip(audio, WALL_E_VOICE.distortionDrive);
  applyDoubling(audio, WALL_E_VOICE.doublingDelayMs, WALL_E_VOICE.doublingMix);
  applyEcho(audio, WALL_E_VOICE.echoDelayMs, WALL_E_VOICE.echoFeedback, WALL_E_VOICE.echoWet);
  normalizeAudio(audio);

  return audio;
}
