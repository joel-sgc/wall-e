import { writeFileSync } from 'fs';
import { SAMPLE_RATE, CHANNELS, BIT_DEPTH } from '../synthesis/types.js';

/**
 * Write a Float64 audio buffer to a standard PCM WAV file.
 * Samples are expected in [-1, 1].
 */
export function writeWav(filePath: string, samples: Float64Array): void {
  const numSamples = samples.length;
  const byteRate   = SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8);
  const blockAlign = CHANNELS * (BIT_DEPTH / 8);
  const dataSize   = numSamples * blockAlign;
  const fileSize   = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  let offset = 0;

  // RIFF header
  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(fileSize, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;

  // fmt chunk
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;       // chunk size
  buf.writeUInt16LE(1,  offset); offset += 2;        // PCM = 1
  buf.writeUInt16LE(CHANNELS, offset); offset += 2;
  buf.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  buf.writeUInt32LE(byteRate, offset); offset += 4;
  buf.writeUInt16LE(blockAlign, offset); offset += 2;
  buf.writeUInt16LE(BIT_DEPTH, offset); offset += 2;

  // data chunk header
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  // PCM samples (16-bit signed LE)
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(clamped * 32767), offset);
    offset += 2;
  }

  writeFileSync(filePath, buf);
}
