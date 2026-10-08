import fs from 'fs';
import os from 'os';
import path from 'path';
import { Cmd, Platform } from '../constants.js';
import { Engine, type AppConfig, type BinPaths } from '../config/config-manager.js';

export enum Capability {
  RECORD = 'record',
  PLAYBACK = 'playback',
  CLIPBOARD = 'clipboard',
  IMPORT = 'import',
  ENGINE_OPENAI = 'engine:openai',
  ENGINE_LOCAL = 'engine:local',
}

export interface NativeDependency {
  bin: string;
  purpose: string;
  neededBy: Capability[];
  platforms?: NodeJS.Platform[];
  install: Partial<Record<NodeJS.Platform, string>>;
  configKey?: keyof BinPaths;
  alternatives?: string[];
}

export const DEPENDENCIES: NativeDependency[] = [
  {
    bin: Cmd.ARECORD,
    purpose: 'Record from the microphone',
    neededBy: [Capability.RECORD],
    platforms: [Platform.LINUX],
    install: { linux: 'sudo apt install alsa-utils' },
    configKey: 'arecord',
  },
  {
    bin: Cmd.SOX,
    purpose: 'Record from the microphone',
    neededBy: [Capability.RECORD],
    platforms: [Platform.DARWIN],
    install: { darwin: 'brew install sox' },
  },
  {
    bin: Cmd.PLAY,
    purpose: 'Play back the microphone test',
    neededBy: [Capability.PLAYBACK],
    platforms: [Platform.LINUX],
    install: { linux: 'sudo apt install sox' },
    alternatives: [Cmd.APLAY],
  },
  {
    bin: Cmd.XCLIP,
    purpose: 'Copy the transcription to the clipboard',
    neededBy: [Capability.CLIPBOARD],
    platforms: [Platform.LINUX],
    install: { linux: 'sudo apt install xclip' },
    alternatives: [Cmd.XSEL],
  },
  {
    bin: Cmd.FFMPEG,
    purpose: 'Convert imported audio the API will not take, and anything over 25 MB',
    neededBy: [Capability.IMPORT, Capability.ENGINE_LOCAL],
    install: { linux: 'sudo apt install ffmpeg', darwin: 'brew install ffmpeg' },
    configKey: 'ffmpeg',
  },
];

const EXTRA_PATHS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['/opt/homebrew/bin', '/usr/local/bin'],
  linux: ['/usr/local/bin', '/snap/bin'],
};

export interface ResolveSources {
  flagPath?: string;
  env?: NodeJS.ProcessEnv;
  binPaths?: BinPaths;
  platform?: NodeJS.Platform;
}

export function envKeyFor(bin: string): string {
  return `TRANSCRIBE_${bin.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PATH`;
}

export function resolveBinary(bin: string, sources: ResolveSources = {}): string | null {
  const { flagPath, env = process.env, binPaths, platform = os.platform() } = sources;

  const explicit = [flagPath, env[envKeyFor(bin)], binPaths?.[bin as keyof BinPaths]];
  for (const candidate of explicit) {
    if (candidate && candidate.trim() !== '') {
      return isExecutable(candidate) ? candidate : null;
    }
  }

  const dirs = [
    ...(env.PATH ?? '').split(path.delimiter).filter(Boolean),
    ...(EXTRA_PATHS[platform] ?? []),
  ];
  for (const dir of dirs) {
    const candidate = path.join(dir, bin);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function isExecutable(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile() && (fs.statSync(candidate).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function capabilitiesFor(
  config: AppConfig,
  flags: { file?: string; copy?: boolean } = {},
): Set<Capability> {
  const capabilities = new Set<Capability>();
  capabilities.add(flags.file ? Capability.IMPORT : Capability.RECORD);
  if (config.autoCopy) capabilities.add(Capability.CLIPBOARD);
  capabilities.add(
    config.engine === Engine.LOCAL ? Capability.ENGINE_LOCAL : Capability.ENGINE_OPENAI,
  );
  return capabilities;
}

export function dependenciesFor(
  capabilities: Set<Capability>,
  platform: NodeJS.Platform = os.platform(),
): NativeDependency[] {
  return DEPENDENCIES.filter(
    (dep) =>
      (dep.platforms === undefined || dep.platforms.includes(platform)) &&
      dep.neededBy.some((c) => capabilities.has(c)),
  );
}

export function isSatisfied(dep: NativeDependency, sources: ResolveSources = {}): boolean {
  const candidates = [dep.bin, ...(dep.alternatives ?? [])];
  return candidates.some((bin) => resolveBinary(bin, sources) !== null);
}

export function missingMessage(
  dep: NativeDependency,
  platform: NodeJS.Platform = os.platform(),
): string {
  const install = dep.install[platform];
  return [
    `${dep.bin} is required to: ${dep.purpose.toLowerCase()}.`,
    install ? `Install it with: ${install}` : 'Install it and make sure it is on your PATH.',
    dep.configKey ? `Or point at an existing one: ${envKeyFor(dep.bin)}=/path/to/${dep.bin}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
