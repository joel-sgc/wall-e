#!/usr/bin/env node
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { synthesize } from './voice/wall-e-voice.js';
import { writeWav } from './output/wav-writer.js';
import { playWav } from './output/player.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_WAV = join(__dirname, '../output.wav');

function checkEspeak(): void {
  try {
    execSync('espeak-ng --version', { stdio: 'ignore' });
  } catch {
    console.error('espeak-ng not found. Install it with:');
    console.error('  sudo pacman -S espeak-ng');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm speak "<text>"');
    process.exit(1);
  }

  checkEspeak();

  const text = args.join(' ');
  console.log(`\nWall-E says: "${text}"\n`);

  console.log('Synthesizing...');
  const t0    = Date.now();
  const audio = synthesize(text);
  const ms    = Date.now() - t0;

  console.log(`Done in ${ms}ms  →  ${(audio.length / 44100).toFixed(2)}s of audio  →  ${OUTPUT_WAV}\n`);

  writeWav(OUTPUT_WAV, audio);
  playWav(OUTPUT_WAV);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
