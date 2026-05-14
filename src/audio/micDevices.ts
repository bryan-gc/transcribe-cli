import { execSync } from 'child_process';
import os from 'os';

export interface MicDevice {
  id: string; // Device identifier passed to the recorder
  label: string; // Human-readable name shown in the UI
}

/**
 * Detects the current platform and returns a list of available
 * microphone/capture devices dynamically.
 *
 * Supported platforms:
 *   - Linux  → uses `arecord -L` (ALSA)
 *   - macOS  → uses `system_profiler SPAudioDataType`
 *   - Windows → falls back to "Default Device" (sox handles selection natively)
 *
 * Always includes a "Default Device" entry as a safe fallback.
 */
export function listMicDevices(): MicDevice[] {
  const platform = os.platform();

  try {
    if (platform === 'linux') {
      return listLinuxDevices();
    }
    if (platform === 'darwin') {
      return listMacDevices();
    }
  } catch {
    // If detection fails for any reason, fall back silently
  }

  return [{ id: 'default', label: 'Default Device' }];
}

// ─── Linux (ALSA via arecord) ─────────────────────────────────────────────────
function listLinuxDevices(): MicDevice[] {
  const raw = execSync('arecord -L 2>/dev/null', { encoding: 'utf-8' });
  const devices: MicDevice[] = [{ id: 'default', label: 'Default Device' }];

  // Top-level lines (no leading whitespace) are device IDs.
  // Lines starting with spaces are descriptions → skip them.
  const topLevel = raw
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith(' ') && !line.startsWith('\t'));

  // Exclude purely virtual/routing devices that cannot capture real audio
  const SKIP = new Set([
    'null',
    'lavrate',
    'samplerate',
    'speexrate',
    'jack',
    'oss',
    'speex',
    'upmix',
    'vdownmix',
  ]);

  for (const id of topLevel) {
    if (SKIP.has(id) || id === 'default') continue;
    devices.push({ id, label: formatAlsaLabel(id) });
  }

  return devices;
}

function formatAlsaLabel(id: string): string {
  if (id === 'pulse') return 'PulseAudio';
  if (id === 'pipewire') return 'PipeWire';

  // plughw:CARD=sofhdadsp,DEV=0  →  "sofhdadsp  DEV 0 (plug)"
  const hwMatch = id.match(/^(plughw|hw):CARD=([^,]+),DEV=(\d+)$/);
  if (hwMatch) {
    const plug = hwMatch[1] === 'plughw' ? ' (plug)' : '';
    return `${hwMatch[2]}  DEV ${hwMatch[3]}${plug}`;
  }

  // sysdefault:CARD=X  →  "X (sysdefault)"
  const sysMatch = id.match(/^sysdefault:CARD=(.+)$/);
  if (sysMatch) return `${sysMatch[1]} (sysdefault)`;

  // dsnoop:CARD=X,DEV=N  →  "X  DEV N (dsnoop)"
  const dsnoopMatch = id.match(/^dsnoop:CARD=([^,]+),DEV=(\d+)$/);
  if (dsnoopMatch) return `${dsnoopMatch[1]}  DEV ${dsnoopMatch[2]} (dsnoop)`;

  return id;
}

// ─── macOS (system_profiler) ──────────────────────────────────────────────────
function listMacDevices(): MicDevice[] {
  const raw = execSync('system_profiler SPAudioDataType 2>/dev/null', { encoding: 'utf-8' });
  const devices: MicDevice[] = [{ id: 'default', label: 'Default Device' }];

  // system_profiler outputs sections like:
  //     Built-in Microphone:
  //       Input Channels: 1
  //       …
  // We grab names of sections that contain "Input Channels" (i.e., are inputs).
  const sections = raw.split(/\n(?=\s{4}\S)/);

  for (const section of sections) {
    if (!section.includes('Input Channels')) continue;
    const nameLine = section.match(/^\s{4}(.+):$/m);
    if (nameLine) {
      const label = nameLine[1]!.trim();
      // sox on macOS uses device names directly
      devices.push({ id: label, label });
    }
  }

  return devices.length > 1 ? devices : [{ id: 'default', label: 'Default Device' }];
}
