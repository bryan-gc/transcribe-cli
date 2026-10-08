import React, { useState } from 'react';
import fs from 'fs';
import { Box, Text, useApp, useInput } from 'ink';
import { Engine, type AppConfig } from '../config/config-manager.js';
import {
  Encoding,
  HISTORY_PAGE_ROWS,
  HOTKEY_EXIT,
  HistoryHotkey,
  RecordingKind,
} from '../constants.js';
import { Header } from './header.js';
import { PreflightPrompt } from './preflight-prompt.js';
import {
  archiveEntries,
  readAttempts,
  readMeta,
  type ArchiveEntry,
  type Attempt,
} from '../utils/archive.js';
import { buildPreflight, type Preflight } from '../utils/preflight.js';
import { transcribeAgain } from '../utils/transcribe-again.js';
import {
  describeOutcome,
  describeTranscriptionError,
  formatDuration,
} from '../utils/run-transcription.js';
import { copyTextToClipboard } from '../utils/clipboard.js';
import { wrapTranscript } from '../utils/transcript-wrapper.js';
import { buildGlossaryPrompt } from '../utils/glossary-prompt.js';
import { audioDurationSeconds } from '../audio/audio-duration.js';
import { glossarySelectionLabel, readSelectedGlossaries } from '../utils/file-utils.js';
import { engineLabel } from './status-fields.js';

export function HistoryApp({
  appConfig,
  glossary,
  diarize,
}: {
  appConfig: AppConfig;
  glossary: string;
  diarize: boolean;
}) {
  const { exit } = useApp();
  const [entries] = useState(() => archiveEntries(appConfig.basePath));
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState<ArchiveEntry | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [picked, setPicked] = useState(0);
  const [menu, setMenu] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const listStatus = `${entries.length} transcriptions, newest first.`;
  const [status, setStatus] = useState(listStatus);

  const openEntry = (entry: ArchiveEntry) => {
    const list = readAttempts(entry);
    setOpen(entry);
    setAttempts(list);
    setPicked(Math.max(0, list.length - 1));
    setFailure(null);
    setStatus(
      list.length === 0 ? 'No transcript yet: press r to transcribe it.' : 'Pick an attempt.',
    );
  };

  const engineMenu = (entry: ArchiveEntry) =>
    buildPreflight(
      readMeta(entry)?.audio?.seconds ?? audioDurationSeconds(entry.audioPath) ?? 0,
      { engine: appConfig.engine, diarize },
      appConfig,
    );

  const retry = async (entry: ArchiveEntry, preflight: Preflight) => {
    const row = preflight.rows[preflight.selected];
    if (!row) return;
    setMenu(null);
    setFailure(null);
    setBusy(true);
    try {
      const outcome = await transcribeAgain(
        entry,
        { engine: row.engine, diarize: row.diarize },
        appConfig,
        glossary,
        (message) => setStatus(`⏳ ${message}`),
      );
      const list = readAttempts(entry);
      setAttempts(list);
      setPicked(list.length - 1);
      setStatus(describeOutcome(outcome));
    } catch (error: unknown) {
      setFailure(describeTranscriptionError(error));
      setStatus('❌ Transcription failed. Pick an engine to try again.');
      setMenu(engineMenu(entry));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (entry: ArchiveEntry, attempt: Attempt, number: number) => {
    const glossaryUsed = attempt.glossaryApplied
      ? buildGlossaryPrompt(
          readSelectedGlossaries(appConfig.basePath, glossary, appConfig.useGeneralGlossary),
        )?.text
      : undefined;
    const text = appConfig.wrapClipboard
      ? wrapTranscript(attempt.text, {
          language: attempt.language ?? appConfig.selectedLanguage,
          diarized: attempt.diarized === true,
          glossaryUsed,
          audioSeconds: readMeta(entry)?.audio?.seconds,
        })
      : attempt.text;
    try {
      await copyTextToClipboard(text);
      setStatus(`📋 Attempt ${number} copied${appConfig.wrapClipboard ? ' · marked' : ''}.`);
    } catch (error: unknown) {
      setStatus(`⚠️ Could not copy: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === HOTKEY_EXIT) {
      exit();
      return;
    }
    if (busy || menu !== null) return;
    const hotkey = input.toLowerCase();

    if (open === null) {
      const last = entries.length - 1;
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow) setCursor((c) => Math.min(last, c + 1));
      else if (key.pageUp) setCursor((c) => Math.max(0, c - HISTORY_PAGE_ROWS));
      else if (key.pageDown) setCursor((c) => Math.min(last, c + HISTORY_PAGE_ROWS));
      else if (key.return && entries[cursor]) openEntry(entries[cursor]);
      else if (hotkey === HistoryHotkey.QUIT) exit();
      return;
    }

    if (key.upArrow) setPicked((p) => Math.max(0, p - 1));
    else if (key.downArrow) setPicked((p) => Math.min(attempts.length - 1, p + 1));
    else if (hotkey === HistoryHotkey.COPY && attempts[picked])
      void copy(open, attempts[picked], picked + 1);
    else if (hotkey === HistoryHotkey.RETRY) setMenu(engineMenu(open));
    else if (key.escape || key.leftArrow || hotkey === HistoryHotkey.BACK) {
      setOpen(null);
      setFailure(null);
      setStatus(listStatus);
    } else if (hotkey === HistoryHotkey.QUIT) exit();
  });

  const width = process.stdout.columns ?? 100;

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="=== transcribe-cli (History) ==="
        statusText={status}
        isBusy={busy}
        fields={[
          {
            label: 'Glossary',
            value: glossarySelectionLabel(glossary, appConfig.useGeneralGlossary),
          },
          { label: 'Engine', value: `${engineLabel(appConfig.engine)} (default)` },
        ]}
      />

      {open === null ? (
        <EntryList entries={entries} cursor={cursor} width={width} />
      ) : (
        <AttemptList entry={open} attempts={attempts} picked={picked} width={width} />
      )}

      {failure !== null && (
        <Box marginTop={1}>
          <Text color="red">{failure}</Text>
        </Box>
      )}

      {open !== null && menu !== null && !busy && (
        <PreflightPrompt
          audioSeconds={menu.audioSeconds}
          rows={menu.rows}
          selected={menu.selected}
          onSelect={(selected) => setMenu({ ...menu, selected })}
          onConfirm={() => void retry(open, menu)}
          onCancel={() => setMenu(null)}
        />
      )}

      {menu === null && !busy && (
        <Box marginTop={1}>
          <Text dimColor>
            {open === null
              ? `[↑↓] move · [PgUp/PgDn] page · [Enter] open · [${HistoryHotkey.QUIT}] quit`
              : `[↑↓] attempt · [${HistoryHotkey.COPY}] copy · [${HistoryHotkey.RETRY}] transcribe again · [Esc/${HistoryHotkey.BACK}] back · [${HistoryHotkey.QUIT}] quit`}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function EntryList({
  entries,
  cursor,
  width,
}: {
  entries: ArchiveEntry[];
  cursor: number;
  width: number;
}) {
  if (entries.length === 0) return <Text>Nothing in the archive yet.</Text>;
  const start = Math.min(
    Math.max(0, cursor - Math.floor(HISTORY_PAGE_ROWS / 2)),
    Math.max(0, entries.length - HISTORY_PAGE_ROWS),
  );
  const visible = entries.slice(start, start + HISTORY_PAGE_ROWS);

  return (
    <Box flexDirection="column">
      {visible.map((entry, offset) => {
        const index = start + offset;
        const selected = index === cursor;
        const head = `${selected ? '› ' : '  '}${entryHeading(entry)}  `;
        return (
          <Text key={entry.audioPath} color={selected ? 'cyan' : undefined} wrap="truncate">
            {head}
            <Text dimColor={!selected}>{oneLine(previewOf(entry), width - head.length - 4)}</Text>
          </Text>
        );
      })}
      <Text dimColor>
        {cursor + 1} / {entries.length}
      </Text>
    </Box>
  );
}

function AttemptList({
  entry,
  attempts,
  picked,
  width,
}: {
  entry: ArchiveEntry;
  attempts: Attempt[];
  picked: number;
  width: number;
}) {
  const chosen = attempts[picked];
  return (
    <Box flexDirection="column">
      <Text bold>
        {entry.day} {clockOf(entry)} · {entry.source} · {lengthOf(entry)} · {entry.name}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {attempts.length === 0 && <Text dimColor>No attempts yet.</Text>}
        {attempts.map((attempt, index) => {
          const selected = index === picked;
          const current = index === attempts.length - 1;
          const head = `${selected ? '› ' : '  '}${String(index + 1).padStart(2)}  ${formatWhen(attempt.at)}  ${describeAttemptEngine(attempt).padEnd(28)}${current ? ' (saved)' : '        '}  `;
          return (
            <Text
              key={`${attempt.at}-${index}`}
              color={selected ? 'cyan' : undefined}
              wrap="truncate"
            >
              {head}
              <Text dimColor={!selected}>{oneLine(attempt.text, width - head.length - 4)}</Text>
            </Text>
          );
        })}
      </Box>
      {chosen && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            Attempt {picked + 1}:
          </Text>
          <Text>{chosen.text.trim() === '' ? '(empty)' : chosen.text}</Text>
        </Box>
      )}
    </Box>
  );
}

function entryHeading(entry: ArchiveEntry): string {
  const kind = entry.source === RecordingKind.RECORDED ? 'rec' : 'imp';
  const attempts = readAttempts(entry).length;
  return `${entry.day} ${clockOf(entry)}  ${kind}  ${lengthOf(entry).padStart(8)}  ${attempts > 1 ? `×${attempts}` : '  '}`;
}

function clockOf(entry: ArchiveEntry): string {
  return entry.name.slice(0, 5).replace('-', ':');
}

function lengthOf(entry: ArchiveEntry): string {
  const seconds = readMeta(entry)?.audio?.seconds;
  return seconds !== undefined ? formatDuration(seconds * 1000) : '';
}

function previewOf(entry: ArchiveEntry): string {
  const label = entry.name.includes('__') ? `${entry.name.split('__')[1]} · ` : '';
  try {
    return `${label}${fs.readFileSync(entry.textPath, Encoding.UTF8)}`;
  } catch {
    return `${label}(no transcript)`;
  }
}

function describeAttemptEngine(attempt: Attempt): string {
  if (!attempt.engine) return 'engine unknown';
  const engine = attempt.engine === Engine.LOCAL ? 'Local' : 'OpenAI';
  return attempt.model ? `${engine} · ${attempt.model}` : engine;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return '(empty)';
  return flat.length > max ? `${flat.slice(0, Math.max(0, max - 1))}…` : flat;
}
