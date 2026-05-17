import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import { Picker } from './Picker.js';
import { MicTest } from './MicTest.js';
import { Header } from './Header.js';
import { useTranscriberApp } from '../hooks/useTranscriberApp.js';
import type { AppConfig } from '../config/configManager.js';
import {
  EXT,
  NONE_OPTION_VALUE,
  HOTKEY_EXIT,
  LANGUAGE_NAMES,
  AVAILABLE_LANGUAGES,
  ViewMode,
  MenuAction,
  type LanguageCode,
} from '../constants.js';

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

export function App({ appConfig }: { appConfig: AppConfig }) {
  const { exit } = useApp();
  const { state, actions } = useTranscriberApp(appConfig, exit);

  const {
    viewMode,
    selectedIndex,
    statusText,
    isRecording,
    isTranscribing,
    transcriptionResult,
    clipboardEnabled,
    currentTextPath,
    activeLanguage,
    activeGlossary,
    activeMic,
    pendingMic,
    micDevices,
    glossaryFiles,
    recorder,
  } = state;

  const {
    setViewMode,
    setSelectedIndex,
    setStatusText,
    setActiveLanguage,
    setActiveGlossary,
    setActiveMic,
    setPendingMic,
    handleAction,
    saveConfig,
  } = actions;

  // ── Keyboard (main menu) ───────────────────────────────────────────────────
  useInput(
    (input, key) => {
      if (key.upArrow) {
        setSelectedIndex((i: number) => (i > 0 ? i - 1 : MAIN_OPTIONS.length - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i: number) => (i < MAIN_OPTIONS.length - 1 ? i + 1 : 0));
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
      <Header
        title="=== transcribe-cli ==="
        statusText={statusText}
        isBusy={isRecording || isTranscribing}
        activeLanguage={activeLanguage}
        glossaryLabel={glossaryLabel}
        micLabel={activeMic.label}
        clipboardEnabled={clipboardEnabled}
        showClipboardHotkey={true}
      />

      {/* ── Main Menu ── */}
      {viewMode === ViewMode.MAIN && (
        <Box flexDirection="column">
          {MAIN_OPTIONS.map((opt, i) => (
            <Text key={opt.id} color={i === selectedIndex ? 'cyan' : undefined}>
              {i === selectedIndex ? '> ' : '  '}
              {opt.label}
            </Text>
          ))}

          {/* ── Last transcription result ── */}
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
