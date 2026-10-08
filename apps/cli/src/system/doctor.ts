import os from 'os';
import {
  Capability,
  DEPENDENCIES,
  isSatisfied,
  resolveBinary,
  type NativeDependency,
  type ResolveSources,
} from './dependencies.js';
import { Engine, type AppConfig } from '../config/config-manager.js';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  inUse: boolean;
  remedy?: string;
}

const GROUP_TITLES: Record<Capability, string> = {
  [Capability.RECORD]: 'Recording',
  [Capability.PLAYBACK]: 'Playback',
  [Capability.CLIPBOARD]: 'Clipboard',
  [Capability.IMPORT]: 'Importing audio files',
  [Capability.ENGINE_OPENAI]: 'Transcription · OpenAI API',
  [Capability.ENGINE_LOCAL]: 'Transcription · local WhisperX',
};

export function runChecks(
  config: AppConfig,
  active: Set<Capability>,
  sources: ResolveSources = {},
): { capability: Capability; title: string; checks: CheckResult[] }[] {
  const platform = sources.platform ?? os.platform();
  const resolveWith = { ...sources, binPaths: config.binPaths, platform };

  return Object.values(Capability).map((capability) => ({
    capability,
    title: GROUP_TITLES[capability],
    checks: [
      ...DEPENDENCIES.filter(
        (dep) =>
          dep.neededBy.includes(capability) &&
          (dep.platforms === undefined || dep.platforms.includes(platform)),
      ).map((dep) => binaryCheck(dep, active.has(capability), resolveWith)),
      ...engineChecks(capability, config, active),
    ],
  }));
}

function binaryCheck(dep: NativeDependency, inUse: boolean, sources: ResolveSources): CheckResult {
  const found = resolveBinary(dep.bin, sources);
  const viaAlternative = found === null && isSatisfied(dep, sources);
  const alternative = viaAlternative
    ? (dep.alternatives ?? []).map((bin) => resolveBinary(bin, sources)).find(Boolean)
    : null;

  return {
    name: dep.bin,
    ok: found !== null || viaAlternative,
    detail: found ?? alternative ?? 'not found',
    inUse,
    remedy: found || viaAlternative ? undefined : dep.install[sources.platform ?? os.platform()],
  };
}

function engineChecks(
  capability: Capability,
  config: AppConfig,
  active: Set<Capability>,
): CheckResult[] {
  if (capability === Capability.ENGINE_OPENAI) {
    return [
      {
        name: 'API key',
        ok: config.apiKey !== '',
        detail: config.apiKey !== '' ? 'configured' : 'not set',
        inUse: active.has(Capability.ENGINE_OPENAI),
        remedy: 'transcribe-cli -c',
      },
    ];
  }
  if (capability === Capability.ENGINE_LOCAL) {
    const found = resolveBinary(config.localWhisper.binPath, {
      flagPath: config.localWhisper.binPath,
    });
    return [
      {
        name: 'whisperx',
        ok: found !== null,
        detail: found ?? `not found at ${config.localWhisper.binPath}`,
        inUse: active.has(Capability.ENGINE_LOCAL),
        remedy: './apps/cli/tools/install-whisperx.sh',
      },
    ];
  }
  return [];
}

export function formatReport(
  groups: ReturnType<typeof runChecks>,
  showAll: boolean,
): { text: string; failedInUse: number; failedUnused: number } {
  const lines: string[] = [];
  let failedInUse = 0;
  let failedUnused = 0;

  for (const group of groups) {
    if (group.checks.length === 0) continue;
    const inUse = group.checks.some((c) => c.inUse);
    if (!inUse && !showAll && group.checks.every((c) => c.ok)) continue;

    lines.push('', `  ${group.title}${inUse ? '  (active)' : '  (not in use)'}`);
    for (const check of group.checks) {
      lines.push(`    ${check.ok ? '✔' : '✘'} ${check.name.padEnd(12)} ${check.detail}`);
      if (!check.ok && check.remedy) lines.push(`      ${check.remedy}`);
      if (!check.ok) {
        if (check.inUse) failedInUse += 1;
        else failedUnused += 1;
      }
    }
  }

  lines.push('');
  if (failedInUse === 0 && failedUnused === 0) lines.push('  Everything checks out.');
  else {
    if (failedInUse > 0) lines.push(`  ${failedInUse} missing in what this setup uses.`);
    if (failedUnused > 0) {
      lines.push(`  ${failedUnused} missing elsewhere — only matters if you turn those on.`);
    }
  }

  return { text: lines.join('\n'), failedInUse, failedUnused };
}

export function engineCapability(engine: Engine): Capability {
  return engine === Engine.LOCAL ? Capability.ENGINE_LOCAL : Capability.ENGINE_OPENAI;
}

export function engineBlockers(config: AppConfig, sources: ResolveSources = {}): CheckResult[] {
  const capability = engineCapability(config.engine);
  return runChecks(config, new Set([capability]), sources)
    .filter((group) => group.capability === capability)
    .flatMap((group) => group.checks)
    .filter((check) => !check.ok);
}

export function activeCapabilities(config: AppConfig, file?: string): Set<Capability> {
  const active = new Set<Capability>([file ? Capability.IMPORT : Capability.RECORD]);
  if (config.autoCopy) active.add(Capability.CLIPBOARD);
  active.add(engineCapability(config.engine));
  return active;
}
