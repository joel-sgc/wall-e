import { execFileSync, execSync } from 'child_process';
import { existsSync } from 'fs';

/**
 * Play a WAV file using whatever audio player is available on the system.
 * Tries PipeWire → PulseAudio → ALSA → mpv → ffplay → sox in order.
 * Throws if none are found.
 */
export function playWav(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const players: Array<{ cmd: string; args: (f: string) => string[] }> = [
    { cmd: 'pw-play',  args: f => [f] },
    { cmd: 'paplay',   args: f => [f] },
    { cmd: 'aplay',    args: f => [f] },
    { cmd: 'mpv',      args: f => ['--no-video', '--really-quiet', f] },
    { cmd: 'ffplay',   args: f => ['-nodisp', '-autoexit', '-loglevel', 'quiet', f] },
    { cmd: 'sox',      args: f => [f, '-d'] },
  ];

  for (const player of players) {
    if (commandExists(player.cmd)) {
      try {
        execFileSync(player.cmd, player.args(filePath), { stdio: 'inherit' });
        return;
      } catch {
        // Try next player
      }
    }
  }

  throw new Error(
    'No audio player found. Install one of: pw-play, paplay, aplay, mpv, ffplay, or sox.',
  );
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
