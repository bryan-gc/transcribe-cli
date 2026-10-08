import fs from 'fs';
import path from 'path';
import { Encoding, USAGE_LOG_FILE } from '../constants.js';
import type { TranscriptionMeta } from './transcription-meta.js';
import { formatCost } from './transcription-meta.js';
import { formatDuration } from './run-transcription.js';
import { readRecentMeta } from './history.js';

export function usageLogPath(basePath: string): string {
  return path.resolve(basePath, USAGE_LOG_FILE);
}

export function appendUsage(basePath: string, meta: TranscriptionMeta): void {
  fs.appendFileSync(usageLogPath(basePath), `${JSON.stringify(meta)}\n`, Encoding.UTF8);
}

export function readUsage(basePath: string): TranscriptionMeta[] {
  const file = usageLogPath(basePath);
  if (!fs.existsSync(file)) {
    const backfilled = readRecentMeta(basePath, Number.POSITIVE_INFINITY).reverse();
    if (backfilled.length === 0) return [];
    fs.writeFileSync(
      file,
      backfilled.map((m) => JSON.stringify(m)).join('\n') + '\n',
      Encoding.UTF8,
    );
    return backfilled;
  }
  return fs
    .readFileSync(file, Encoding.UTF8)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as TranscriptionMeta];
      } catch {
        return [];
      }
    });
}

export interface UsageTotals {
  runs: number;
  audioSeconds: number;
  tookMs: number;
  usd: number;
}

function add(into: Map<string, UsageTotals>, key: string, meta: TranscriptionMeta): void {
  const t = into.get(key) ?? { runs: 0, audioSeconds: 0, tookMs: 0, usd: 0 };
  t.runs += 1;
  t.audioSeconds += meta.audio?.seconds ?? 0;
  t.tookMs += meta.tookMs ?? 0;
  t.usd += meta.cost?.usd ?? 0;
  into.set(key, t);
}

export function summarizeUsage(entries: TranscriptionMeta[]) {
  const byDay = new Map<string, UsageTotals>();
  const byModel = new Map<string, UsageTotals>();
  const total = new Map<string, UsageTotals>();
  for (const meta of entries) {
    add(byDay, meta.at.slice(0, 10), meta);
    add(byModel, `${meta.engine} · ${meta.model}`, meta);
    add(total, 'total', meta);
  }
  return {
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)),
    byModel: [...byModel.entries()].sort(([, a], [, b]) => b.usd - a.usd),
    total: total.get('total') ?? { runs: 0, audioSeconds: 0, tookMs: 0, usd: 0 },
  };
}

function money(usd: number): string {
  return formatCost({ usd, estimated: false });
}

function table(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

function totalsRow(label: string, t: UsageTotals): string[] {
  return [
    label,
    String(t.runs),
    formatDuration(t.audioSeconds * 1000),
    formatDuration(t.tookMs),
    money(t.usd),
  ];
}

export function formatUsageReport(entries: TranscriptionMeta[], showEveryRun = false): string {
  if (entries.length === 0) return 'No transcriptions recorded yet.';

  const { byDay, byModel, total } = summarizeUsage(entries);
  const columns = ['', 'Runs', 'Audio', 'Took', 'Cost'];
  const sections = [
    'By day\n' +
      table(
        ['Day', ...columns.slice(1)],
        [...byDay.map(([day, t]) => totalsRow(day, t)), totalsRow('Total', total)],
      ),
    'By engine\n' +
      table(
        ['Engine', ...columns.slice(1)],
        byModel.map(([k, t]) => totalsRow(k, t)),
      ),
  ];

  if (showEveryRun) {
    sections.push(
      'Every run\n' +
        table(
          ['When', 'File', 'Engine', 'Audio', 'Took', 'Cost'],
          entries.map((m) => [
            m.at.slice(0, 16).replace('T', ' '),
            m.audio?.file ?? '',
            `${m.engine} · ${m.model}`,
            m.audio?.seconds === undefined ? '?' : formatDuration(m.audio.seconds * 1000),
            formatDuration(m.tookMs ?? 0),
            money(m.cost?.usd ?? 0),
          ]),
        ),
    );
  }

  return sections.join('\n\n');
}
