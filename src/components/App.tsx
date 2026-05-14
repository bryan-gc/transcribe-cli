import React, { useState, useRef, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import fs from 'fs';
import { Picker } from './Picker.js';
import { MicTest } from './MicTest.js';
import { AudioRecorder } from '../audio/recorder.js';
import { listMicDevices } from '../audio/micDevices.js';
import type { MicDevice } from '../audio/micDevices.js';
import { WhisperTranscriber } from '../transcriber/WhisperTranscriber.js';
import { LanguageCode, LANGUAGE_NAMES, AVAILABLE_LANGUAGES } from '../transcriber/LanguageEnum.js';
import { TranscriptionFormat } from '../transcriber/TranscriptionFormat.js';
import { extractTextFromSrt } from '../utils/srtParser.js';
import { copyTextToClipboard } from '../utils/clipboard.js';
import { config } from '../config/env.js';
import { DIR, EXT, DEFAULT_DEVICE_ID } from '../constants.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum ViewMode {
  MAIN = 'MAIN',
  LANGUAGES = 'LANGUAGES',
  GLOSSARIES = 'GLOSSARIES',
  MICROPHONES = 'MICROPHONES',
  MIC_TEST = 'MIC_TEST',
}

export enum MenuAction {
  RECORD = 'r',
  PAUSE = 'p',
  STOP = 's',
  TRANSCRIBE = 't',
  CHANGE_LANGUAGE = 'l',
  CHANGE_GLOSSARY = 'g',
  CHANGE_MICROPHONE = 'm',
  TOGGLE_CLIPBOARD = 'c',
  QUIT = 'q',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GLOSSARIES_DIR = path.resolve(process.cwd(), DIR.GLOSSARIES);

const MAIN_OPTIONS: { id: MenuAction; label: string }[] = [
  { id: MenuAction.RECORD, label: 'Record [r]' },
  { id: MenuAction.PAUSE, label: 'Pause [p]' },
  { id: MenuAction.STOP, label: 'Stop [s]' },
  { id: MenuAction.TRANSCRIBE, label: 'Transcribe [t]' },
  { id: MenuAction.CHANGE_LANGUAGE, label: 'Change Language [l]' },
  { id: MenuAction.CHANGE_GLOSSARY, label: 'Change Glossary [g]' },
  { id: MenuAction.CHANGE_MICROPHONE, label: 'Change Microphone [m]' },
  { id: MenuAction.QUIT, label: 'Quit [q]' },
];

const VALID_ACTION_KEYS = new Set(Object.values(MenuAction) as string[]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadGlossaryFiles(): string[] {
  if (!fs.existsSync(GLOSSARIES_DIR)) fs.mkdirSync(GLOSSARIES_DIR, { recursive: true });
  return fs
    .readdirSync(GLOSSARIES_DIR)
    .filter((f) => f.endsWith(EXT.GLOSSARY))
    .sort();
}

function readGlossaryContent(filename: string): string | undefined {
  if (!filename) return undefined;
  const filepath = path.join(GLOSSARIES_DIR, filename);
  const content = fs.existsSync(filepath) ? fs.readFileSync(filepath, 'utf-8').trim() : '';
  return content || undefined;
}

function getTimestampPaths() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const folder = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const base = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const tmpDir = path.resolve(process.cwd(), DIR.TMP, folder);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  return {
    audioPath: path.join(tmpDir, `${base}${EXT.AUDIO}`),
    srtPath: path.join(tmpDir, `${base}${EXT.SUBTITLES}`),
    textPath: path.join(tmpDir, `${base}${EXT.TEXT}`),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function App() {
  const { exit } = useApp();

  // ── State ──────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.MAIN);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusText, setStatusText] = useState('Ready to record.');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [clipboardEnabled, setClipboardEnabled] = useState(true);

  const [currentAudioPath, setCurrentAudioPath] = useState('');
  const [currentSrtPath, setCurrentSrtPath] = useState('');
  const [currentTextPath, setCurrentTextPath] = useState('');

  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>(
    AVAILABLE_LANGUAGES.includes(config.DEFAULT_LANGUAGE as LanguageCode)
      ? (config.DEFAULT_LANGUAGE as LanguageCode)
      : LanguageCode.ENGLISH,
  );

  const initialGlossaries = loadGlossaryFiles();
  const [activeGlossary, setActiveGlossary] = useState(initialGlossaries[0] ?? '');

  const initialMics = listMicDevices();
  const fallbackMic: MicDevice = { id: DEFAULT_DEVICE_ID, label: 'Default Device' };
  const [activeMic, setActiveMic] = useState<MicDevice>(initialMics[0] ?? fallbackMic);
  const [pendingMic, setPendingMic] = useState<MicDevice>(initialMics[0] ?? fallbackMic);
  const [micDevices, setMicDevices] = useState<MicDevice[]>(initialMics);
  const [glossaryFiles, setGlossaryFiles] = useState<string[]>(initialGlossaries);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const recorderRef = useRef(new AudioRecorder());
  const transcriber = useRef(new WhisperTranscriber());
  const recorder = recorderRef.current;
  try {
    recorder.setDevice(activeMic.id);
  } catch {
    /* recording in progress */
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleAction = useCallback(
    async (actionId: MenuAction) => {
      switch (actionId) {
        case MenuAction.RECORD:
          if (!isRecording) {
            const p = getTimestampPaths();
            setCurrentAudioPath(p.audioPath);
            setCurrentSrtPath(p.srtPath);
            setCurrentTextPath(p.textPath);
            recorder.start(p.audioPath);
            setIsRecording(true);
            setIsPaused(false);
            setTranscriptionResult('');
            setStatusText('🔴 Recording...');
            return;
          }
          if (isPaused) {
            recorder.resume();
            setIsPaused(false);
            setStatusText('🔴 Recording...');
            return;
          }
          setStatusText('Already recording.');
          break;

        case MenuAction.PAUSE:
          if (isRecording && !isPaused) {
            recorder.pause();
            setIsPaused(true);
            setStatusText('⏸️  Paused');
            return;
          }
          setStatusText('No active recording to pause.');
          break;

        case MenuAction.STOP:
          if (isRecording) {
            await recorder.stop();
            setIsRecording(false);
            setIsPaused(false);
            setStatusText('⏹️  Stopped. File saved.');
            return;
          }
          setStatusText('No recording in progress.');
          break;

        case MenuAction.CHANGE_LANGUAGE:
          setViewMode(ViewMode.LANGUAGES);
          break;

        case MenuAction.CHANGE_GLOSSARY:
          setGlossaryFiles(loadGlossaryFiles());
          setViewMode(ViewMode.GLOSSARIES);
          break;

        case MenuAction.CHANGE_MICROPHONE: {
          const fresh = listMicDevices();
          setMicDevices(fresh);
          setPendingMic(activeMic);
          setViewMode(ViewMode.MICROPHONES);
          break;
        }

        case MenuAction.TOGGLE_CLIPBOARD:
          setClipboardEnabled((prev) => !prev);
          break;

        case MenuAction.TRANSCRIBE: {
          if (isRecording) {
            setStatusText('Please stop the recording before transcribing.');
            return;
          }
          if (!currentAudioPath || !fs.existsSync(currentAudioPath)) {
            setStatusText('No recent audio file found to transcribe.');
            return;
          }

          const glossaryPrompt = readGlossaryContent(activeGlossary);
          setIsTranscribing(true);
          setStatusText(
            `⏳ Transcribing (${LANGUAGE_NAMES[activeLanguage]}${glossaryPrompt ? ' + glossary' : ''}) - Initializing...`,
          );
          try {
            const srtContent = await transcriber.current.transcribe(
              currentAudioPath,
              activeLanguage,
              TranscriptionFormat.SRT,
              glossaryPrompt,
              (msg) => setStatusText(`⏳ Transcribing: ${msg}`),
            );

            setStatusText('⏳ Formatting text and saving files...');
            fs.writeFileSync(currentSrtPath, srtContent, 'utf-8');
            const cleanText = extractTextFromSrt(srtContent);
            fs.writeFileSync(currentTextPath, cleanText, 'utf-8');
            setTranscriptionResult(cleanText);

            if (clipboardEnabled) {
              copyTextToClipboard(cleanText);
              setStatusText('✅ Transcription done — copied to clipboard.');
              return;
            }
            setStatusText('✅ Transcription completed and saved.');
          } catch (err: unknown) {
            setStatusText(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setIsTranscribing(false);
          }
          break;
        }

        case MenuAction.QUIT:
          if (isRecording) await recorder.stop();
          exit();
          break;
      }
    },
    [
      isRecording,
      isPaused,
      currentAudioPath,
      currentSrtPath,
      currentTextPath,
      activeLanguage,
      activeGlossary,
      activeMic,
      clipboardEnabled,
      recorder,
      exit,
    ],
  );

  // ── Keyboard (main menu) ───────────────────────────────────────────────────
  useInput(
    (input, key) => {
      if (key.upArrow) {
        setSelectedIndex((i) => (i > 0 ? i - 1 : MAIN_OPTIONS.length - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i) => (i < MAIN_OPTIONS.length - 1 ? i + 1 : 0));
        return;
      }
      if (key.return) {
        const action = MAIN_OPTIONS[selectedIndex]?.id;
        if (action) handleAction(action);
        return;
      }
      if (key.ctrl && input === 'c') {
        if (isRecording) recorder.stop().catch(() => {});
        exit();
        return;
      }
      if (VALID_ACTION_KEYS.has(input.toLowerCase())) {
        handleAction(input.toLowerCase() as MenuAction);
      }
    },
    { isActive: viewMode === ViewMode.MAIN && !isTranscribing },
  );

  // ── Derived ────────────────────────────────────────────────────────────────
  const glossaryLabel = activeGlossary ? path.basename(activeGlossary, EXT.GLOSSARY) : '(none)';

  const languageOptions = AVAILABLE_LANGUAGES.map((lang) => ({
    label: LANGUAGE_NAMES[lang],
    value: lang,
  }));

  const glossaryOptions = [
    { label: '(none)', value: '__none__' },
    ...glossaryFiles.map((f) => ({ label: path.basename(f, EXT.GLOSSARY), value: f })),
  ];

  const micOptions = micDevices.map((mic) => ({
    label: mic.id === activeMic.id ? `${mic.label} (current)` : mic.label,
    value: mic.id,
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" padding={1}>
      {/* ── Header ── */}
      <Text bold>{'=== CLI Audio Transcriber ==='}</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text>
          Status: <Text color="yellow">{statusText}</Text>
        </Text>
        <Text>
          Language: <Text color="magenta">{LANGUAGE_NAMES[activeLanguage]}</Text>
        </Text>
        <Text>
          Glossary: <Text color="magenta">{glossaryLabel}</Text>
        </Text>
        <Text>
          Microphone: <Text color="magenta">{activeMic.label}</Text>
        </Text>
        <Text>
          Clipboard:{' '}
          <Text color={clipboardEnabled ? 'green' : 'red'}>
            {clipboardEnabled ? '✅ On' : '❌ Off'}
          </Text>
          <Text dimColor> [c]</Text>
        </Text>
      </Box>

      {/* ── Main Menu ── */}
      {viewMode === ViewMode.MAIN && (
        <Box flexDirection="column">
          {MAIN_OPTIONS.map((opt, i) => (
            <Text key={opt.id} color={i === selectedIndex ? 'cyan' : undefined}>
              {i === selectedIndex ? '> ' : '  '}
              {opt.label}
            </Text>
          ))}

          {/* ── Last transcription result (plain, no box) ── */}
          {transcriptionResult !== '' && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="cyan">
                Last transcription:
              </Text>
              <Text>{transcriptionResult}</Text>
              <Text dimColor>📄 {currentTextPath}</Text>
            </Box>
          )}

          <Box marginTop={1}>
            <Text dimColor>↑↓ navigate · Enter confirm · or press key in [brackets]</Text>
          </Box>
        </Box>
      )}

      {/* ── Language Picker ── */}
      {viewMode === ViewMode.LANGUAGES && (
        <Picker
          title="Select Language"
          options={languageOptions}
          onSelect={(value) => {
            setActiveLanguage(value as LanguageCode);
            setStatusText(`Language changed to ${LANGUAGE_NAMES[value as LanguageCode]}.`);
            setViewMode(ViewMode.MAIN);
          }}
          onCancel={() => setViewMode(ViewMode.MAIN)}
        />
      )}

      {/* ── Glossary Picker ── */}
      {viewMode === ViewMode.GLOSSARIES && (
        <Picker
          title="Select Glossary"
          options={glossaryOptions}
          onSelect={(value) => {
            const finalValue = value === '__none__' ? '' : value;
            setActiveGlossary(finalValue);
            setStatusText(
              `Glossary changed to: ${finalValue ? path.basename(finalValue, EXT.GLOSSARY) : 'none'}.`,
            );
            setViewMode(ViewMode.MAIN);
          }}
          onCancel={() => setViewMode(ViewMode.MAIN)}
        />
      )}

      {/* ── Microphone Picker ── */}
      {viewMode === ViewMode.MICROPHONES && (
        <Picker
          title="Select Microphone"
          options={micOptions}
          onSelect={(value) => {
            const mic = micDevices.find((d) => d.id === value) ?? { id: value, label: value };
            setPendingMic(mic);
            setViewMode(ViewMode.MIC_TEST);
          }}
          onCancel={() => setViewMode(ViewMode.MAIN)}
        />
      )}

      {/* ── Microphone Test ── */}
      {viewMode === ViewMode.MIC_TEST && (
        <MicTest
          mic={pendingMic}
          onConfirm={() => {
            setActiveMic(pendingMic);
            setStatusText(`Microphone set to: ${pendingMic.label}.`);
            setViewMode(ViewMode.MAIN);
          }}
          onCancel={() => setViewMode(ViewMode.MICROPHONES)}
        />
      )}
    </Box>
  );
}
