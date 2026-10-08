import { execSync } from 'child_process';
import os from 'os';
import {
  DEFAULT_DEVICE_ID,
  DEFAULT_DEVICE_LABEL,
  Platform,
  Cmd,
  Encoding,
  AlsaDevice,
  ALSA_VIRTUAL_DEVICES,
} from '../constants.js';

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
    if (platform === Platform.LINUX) {
      return listLinuxDevices();
    }
    if (platform === Platform.DARWIN) {
      return listMacDevices();
    }
  } catch {
    // If detection fails for any reason, fall back silently
  }

  return [{ id: DEFAULT_DEVICE_ID, label: DEFAULT_DEVICE_LABEL }];
}

// ─── Linux (ALSA via arecord / PipeWire via pw-dump) ──────────────────────────
function listLinuxDevices(): MicDevice[] {
  const devices: MicDevice[] = [{ id: DEFAULT_DEVICE_ID, label: DEFAULT_DEVICE_LABEL }];

  // 1. Try PipeWire (pw-dump) for user-friendly names matching Ubuntu settings
  try {
    const rawPw = execSync(`${Cmd.PW_DUMP} 2>/dev/null`, { encoding: Encoding.UTF8 });
    const nodes = JSON.parse(rawPw);

    let foundPwDevices = false;
    for (const node of nodes) {
      const props = node?.info?.props;
      if (props && props['media.class'] === 'Audio/Source') {
        const id = props['node.name'];
        const label = props['node.description'] || id;
        if (id) {
          devices.push({ id, label });
          foundPwDevices = true;
        }
      }
    }

    if (foundPwDevices) {
      return devices;
    }
  } catch {
    // Fallback to arecord if pw-dump fails or isn't installed
  }

  // 2. Fallback to ALSA (arecord -L)
  try {
    const raw = execSync(`${Cmd.ARECORD} -L 2>/dev/null`, { encoding: Encoding.UTF8 });

    // Top-level lines (no leading whitespace) are device IDs.
    // Lines starting with spaces are descriptions → skip them.
    const topLevel = raw
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith(' ') && !line.startsWith('\t'));

    for (const id of topLevel) {
      if (ALSA_VIRTUAL_DEVICES.has(id) || id === DEFAULT_DEVICE_ID) continue;
      devices.push({ id, label: formatAlsaLabel(id) });
    }
  } catch {
    // Ignore error
  }

  return devices;
}

function formatAlsaLabel(id: string): string {
  if (id === AlsaDevice.PULSE) return 'PulseAudio';
  if (id === AlsaDevice.PIPEWIRE) return 'PipeWire';

  // plughw:CARD=sofhdadsp,DEV=0  →  "sofhdadsp  DEV 0 (plug)"
  const hwMatch = id.match(/^(plughw|hw):CARD=([^,]+),DEV=(\d+)$/);
  if (hwMatch) {
    const plug = hwMatch[1] === AlsaDevice.PLUGHW ? ' (plug)' : '';
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
  const raw = execSync(`${Cmd.SYSTEM_PROFILER} SPAudioDataType 2>/dev/null`, {
    encoding: Encoding.UTF8,
  });
  const devices: MicDevice[] = [{ id: DEFAULT_DEVICE_ID, label: DEFAULT_DEVICE_LABEL }];

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

  return devices.length > 1 ? devices : [{ id: DEFAULT_DEVICE_ID, label: DEFAULT_DEVICE_LABEL }];
}

export function resolveMicDevice(
  priority: string[],
  available: MicDevice[] = listMicDevices(),
): { device: MicDevice; isFallback: boolean } {
  for (const [index, id] of priority.entries()) {
    const match = available.find((d) => d.id === id);
    if (match) return { device: match, isFallback: index > 0 };
  }
  const fallback = available[0] ?? { id: DEFAULT_DEVICE_ID, label: DEFAULT_DEVICE_LABEL };
  return { device: fallback, isFallback: priority.length > 0 };
}
