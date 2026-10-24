import fs from 'fs';
import path from 'path';
import { CONFIG_DIR } from '../config/config-manager.js';

const PACKAGE_NAME = '@bryan-gc/transcribe-cli';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const REGISTRY_TIMEOUT_MS = 3000;
const CACHE_FILE = path.join(CONFIG_DIR, 'update-check.json');

const GLOBAL_INSTALLS: { marker: string; command: string }[] = [
  { marker: '/pnpm/global/', command: `pnpm add -g ${PACKAGE_NAME}@latest` },
  { marker: '/yarn/global/', command: `yarn global add ${PACKAGE_NAME}@latest` },
  { marker: '/.bun/install/global/', command: `bun add -g ${PACKAGE_NAME}@latest` },
  { marker: '/lib/node_modules/', command: `npm install -g ${PACKAGE_NAME}@latest` },
  { marker: '/npm/node_modules/', command: `npm install -g ${PACKAGE_NAME}@latest` },
];

export function checkForUpdate(currentVersion: string, runningFile: string): void {
  const command = globalUpdateCommand(runningFile);
  if (command === null || !process.stderr.isTTY) return;

  const latest = readCachedLatest();
  if (latest !== null && isNewer(latest, currentVersion)) {
    process.stderr.write(
      `⬆️  transcribe-cli ${latest} is out (you have ${currentVersion}). Update with: ${command}\n\n`,
    );
  }
  void refreshLatest();
}

function globalUpdateCommand(runningFile: string): string | null {
  const where = runningFile.split(path.sep).join('/');
  if (!where.includes(`/node_modules/${PACKAGE_NAME}/`)) return null;
  return GLOBAL_INSTALLS.find(({ marker }) => where.includes(marker))?.command ?? null;
}

function readCachedLatest(): string | null {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as { latest?: unknown };
    return typeof cached.latest === 'string' ? cached.latest : null;
  } catch {
    return null;
  }
}

async function refreshLatest(): Promise<void> {
  const registry = process.env.npm_config_registry || DEFAULT_REGISTRY;
  const base = registry.endsWith('/') ? registry : `${registry}/`;
  try {
    const response = await fetch(`${base}${PACKAGE_NAME.replace('/', '%2f')}/latest`, {
      signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
    });
    if (!response.ok) return;
    const { version } = (await response.json()) as { version?: unknown };
    if (typeof version !== 'string') return;
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ latest: version, checkedAt: new Date() }));
  } catch {
    return;
  }
}

function isNewer(candidate: string, current: string): boolean {
  const numbers = (version: string) => version.split('-')[0]!.split('.').map(Number);
  const [a, b] = [numbers(candidate), numbers(current)];
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
