import React, { useState, useRef, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import fs from 'fs';
import { Picker } from './Picker.js';
import { MicTest } from './MicTest.js';
import Spinner from 'ink-spinner';
import { AudioRecorder } from '../audio/recorder.js';
import { listMicDevices } from '../audio/micDevices.js';
import type { MicDevice } from '../audio/micDevices.js';
import { WhisperTranscriber } from '../transcriber/WhisperTranscriber.js';
import { extractTextFromSrt } from '../utils/srtParser.js';
import { copyTextToClipboard } from '../utils/clipboard.js';
import { type AppConfig, ConfigManager } from '../config/configManager.js';
import {
  DIR,
  EXT,
  DEFAULT_DEVICE_ID,
  DEFAULT_DEVICE_LABEL,
  NONE_OPTION_VALUE,
  HOTKEY_EXIT,
  Encoding,
  LanguageCode,
  LANGUAGE_NAMES,
  AVAILABLE_LANGUAGES,
  TranscriptionFormat,
  ViewMode,
  MenuAction,
  getPaths,
} from '../constants.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAIN_OPTIONS: { id: MenuAction; label: string }[] = [
  { id: MenuAction.RECORD, label: `Record [${MenuAction.RECORD}]` },
  { id: MenuAction.PAUSE, label: `Pause [${MenuAction.PAUSE}]` },
  { id: MenuAction.STOP, label: `Stop [${MenuAction.STOP}]` },
  { id: MenuAction.TRANSCRIBE, label: `Transcribe [${MenuAction.TRANSCRIBE}]` },
  { id: MenuAction.CHANGE_LANGUAGE, label: `Change Language [${MenuAction.CHANGE_LANGUAGE}]` },
  { id: MenuAction.CHANGE_GLOSSARY, label: `Change Glossary [${MenuAction.CHANGE_GLOSSARY}]` },
  {
    id: MenuAction.CHANGE_MICROPHONE,
    label: `Change Microphone [${MenuAction.CHANGE_MICROPHONE}]`,
  },
  { id: MenuAction.QUIT, label: `Quit [${MenuAction.QUIT}]` },
];

const VALID_ACTION_KEYS = new Set(Object.values(MenuAction) as string[]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadGlossaryFiles(basePath: string): string[] {
  const dir = getPaths(basePath).GLOSSARIES_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(EXT.GLOSSARY))
    .sort();
}

function readGlossaryContent(basePath: string, filename: string): string | undefined {
  if (!filename) return undefined;
  const filepath = path.join(getPaths(basePath).GLOSSARIES_DIR, filename);
  const content = fs.existsSync(filepath) ? fs.readFileSync(filepath, Encoding.UTF8).trim() : '';
  return content || undefined;
}

function getTimestampPaths(basePath: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const folder = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const base = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const tmpDir = path.resolve(basePath, DIR.TMP, folder);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  return {
    audioPath: path.join(tmpDir, `${base}${EXT.AUDIO}`),
    srtPath: path.join(tmpDir, `${base}${EXT.SUBTITLES}`),
    textPath: path.join(tmpDir, `${base}${EXT.TEXT}`),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function App({ appConfig }: { appConfig: AppConfig }) {
  const { exit } = useApp();

  // ── State ──────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.MAIN);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusText, setStatusText] = useState('Ready to record.');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [clipboardEnabled, setClipboardEnabled] = useState(appConfig.autoCopy);

  const [currentAudioPath, setCurrentAudioPath] = useState('');
  const [currentSrtPath, setCurrentSrtPath] = useState('');
  const [currentTextPath, setCurrentTextPath] = useState('');

  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>(
    AVAILABLE_LANGUAGES.includes(appConfig.selectedLanguage)
      ? appConfig.selectedLanguage
      : LanguageCode.ENGLISH,
  );

  const initialGlossaries = loadGlossaryFiles(appConfig.basePath);
  const [activeGlossary, setActiveGlossary] = useState(initialGlossaries[0] ?? '');

  const initialMics = listMicDevices();
  const fallbackMic: MicDevice = { id: DEFAULT_DEVICE_ID, label: DEFAULT_DEVICE_LABEL };
  const savedMic = initialMics.find((m) => m.id === appConfig.selectedMicrophone);
  const [activeMic, setActiveMic] = useState<MicDevice>(savedMic ?? fallbackMic);
  const [pendingMic, setPendingMic] = useState<MicDevice>(savedMic ?? fallbackMic);
  const [micDevices, setMicDevices] = useState<MicDevice[]>(initialMics);
  const [glossaryFiles, setGlossaryFiles] = useState<string[]>(initialGlossaries);

  const saveConfig = (updates: Partial<AppConfig>) => {
    const newConfig = { ...appConfig, ...updates };
    ConfigManager.save(newConfig);
    Object.assign(appConfig, updates); // mutate for current session ref
  };

  // ── Refs ───────────────────────────────────────────────────────────────────
  const recorderRef = useRef(new AudioRecorder());
  const transcriber = useRef(new WhisperTranscriber(appConfig.apiKey));
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
            const p = getTimestampPaths(appConfig.basePath);
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
          setGlossaryFiles(loadGlossaryFiles(appConfig.basePath));
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
          setClipboardEnabled((prev) => {
            const newValue = !prev;
            saveConfig({ autoCopy: newValue });
            return newValue;
          });
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

          const glossaryPrompt = readGlossaryContent(appConfig.basePath, activeGlossary);
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
            fs.writeFileSync(currentSrtPath, srtContent, Encoding.UTF8);
            const cleanText = extractTextFromSrt(srtContent);
            fs.writeFileSync(currentTextPath, cleanText, Encoding.UTF8);
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
      appConfig.basePath,
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
      if (key.ctrl && input === HOTKEY_EXIT) {
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
    { label: '(none)', value: NONE_OPTION_VALUE },
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
      <Text bold>{'=== transcribe-cli ==='}</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text>
          Status:{' '}
          <Text color="yellow">
            {(isRecording || isTranscribing) && (
              <Text color="cyan">
                <Spinner type="dots" />{' '}
              </Text>
            )}
            {statusText}
          </Text>
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
            saveConfig({ selectedLanguage: value as LanguageCode });
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
            const finalValue = value === NONE_OPTION_VALUE ? '' : value;
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
          basePath={appConfig.basePath}
          onConfirm={() => {
            setActiveMic(pendingMic);
            saveConfig({ selectedMicrophone: pendingMic.id });
            setStatusText(`Microphone set to: ${pendingMic.label}.`);
            setViewMode(ViewMode.MAIN);
          }}
          onCancel={() => setViewMode(ViewMode.MICROPHONES)}
        />
      )}
    </Box>
  );
}
