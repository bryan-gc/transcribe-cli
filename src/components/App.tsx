import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import { glossarySelectionLabel } from '../utils/fileUtils.js';
import { glossaryOptionLabel, readGlossarySummary } from '../glossary/glossaryCommand.js';
import { Picker } from './Picker.js';
import { PriorityPicker } from './PriorityPicker.js';
import { MicTest } from './MicTest.js';
import { Header } from './Header.js';
import { useTranscriberApp } from '../hooks/useTranscriberApp.js';
import { resolveMicDevice } from '../audio/micDevices.js';
import {
  clipboardField,
  engineField,
  engineLabel,
  engineOption,
  glossaryField,
  languageField,
} from './statusFields.js';
import { Engine, type AppConfig } from '../config/configManager.js';
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

interface MenuEntry {
  id: MenuAction;
  label: string;
  section: 'Actions' | 'Settings' | '';
}

const MAIN_OPTIONS: MenuEntry[] = [
  { id: MenuAction.RECORD, label: 'Record', section: 'Actions' },
  { id: MenuAction.PAUSE, label: 'Pause', section: 'Actions' },
  { id: MenuAction.STOP, label: 'Stop', section: 'Actions' },
  { id: MenuAction.TRANSCRIBE, label: 'Transcribe', section: 'Actions' },
  { id: MenuAction.CHANGE_LANGUAGE, label: 'Language', section: 'Settings' },
  { id: MenuAction.CHANGE_GLOSSARY, label: 'Glossary', section: 'Settings' },
  { id: MenuAction.TOGGLE_GENERAL_GLOSSARY, label: 'General glossary', section: 'Settings' },
  { id: MenuAction.CHANGE_MICROPHONE, label: 'Microphone', section: 'Settings' },
  { id: MenuAction.CHANGE_ENGINE, label: 'Engine', section: 'Settings' },
  { id: MenuAction.TOGGLE_CLIPBOARD, label: 'Clipboard', section: 'Settings' },
  { id: MenuAction.TOGGLE_WRAP, label: 'Copy notice', section: 'Settings' },
  { id: MenuAction.QUIT, label: 'Quit', section: '' },
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
    wrapEnabled,
    generalGlossaryEnabled,
    currentTextPath,
    activeLanguage,
    activeGlossary,
    activeEngine,
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
    setActiveEngine,
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

  const extraMics = appConfig.microphonePriority.length - 1;
  const micSummary = extraMics > 0 ? `${activeMic.label}  (+${extraMics} more)` : activeMic.label;

  const settingValues: Partial<Record<MenuAction, string>> = {
    [MenuAction.CHANGE_LANGUAGE]: LANGUAGE_NAMES[activeLanguage],
    [MenuAction.CHANGE_GLOSSARY]: glossaryLabel,
    [MenuAction.TOGGLE_GENERAL_GLOSSARY]: generalGlossaryEnabled ? 'On' : 'Off',
    [MenuAction.CHANGE_MICROPHONE]: micSummary,
    [MenuAction.CHANGE_ENGINE]: engineField(activeEngine, null).value,
    [MenuAction.TOGGLE_CLIPBOARD]: clipboardEnabled ? 'On' : 'Off',
    [MenuAction.TOGGLE_WRAP]: wrapEnabled ? 'On' : 'Off',
  };

  const languageOptions = AVAILABLE_LANGUAGES.map((lang) => ({
    label: LANGUAGE_NAMES[lang],
    value: lang,
  }));

  const glossaryOptions = [
    { label: '(none)', value: NONE_OPTION_VALUE },
    ...glossaryFiles.map((f) => ({
      label: glossaryOptionLabel(readGlossarySummary(appConfig.basePath, f)),
      value: f,
    })),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="=== transcribe-cli ==="
        statusText={statusText}
        isBusy={isRecording || isTranscribing}
        fields={[
          languageField(activeLanguage),
          glossaryField(glossarySelectionLabel(activeGlossary, generalGlossaryEnabled)),
          { label: 'Microphone', value: activeMic.label },
          engineField(appConfig.engine, null),
          clipboardField(clipboardEnabled, null, wrapEnabled),
        ]}
      />

      {/* ── Main Menu ── */}
      {viewMode === ViewMode.MAIN && (
        <Box flexDirection="column">
          {MAIN_OPTIONS.map((opt, i) => {
            const startsSection = i > 0 && MAIN_OPTIONS[i - 1]!.section !== opt.section;
            const first = MAIN_OPTIONS.findIndex((o) => o.section === opt.section) === i;
            return (
              <Box key={opt.id} flexDirection="column">
                {startsSection && <Text> </Text>}
                {first && opt.section !== '' && (
                  <Text bold color="cyan">
                    {opt.section}
                  </Text>
                )}
                <Text color={i === selectedIndex ? 'cyan' : undefined}>
                  {i === selectedIndex ? '> ' : '  '}
                  {`${opt.label} [${opt.id}]`.padEnd(24)}
                  <Text color="magenta">{settingValues[opt.id] ?? ''}</Text>
                </Text>
              </Box>
            );
          })}

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

      {viewMode === ViewMode.ENGINES && (
        <Picker
          title="Select Engine"
          options={[Engine.OPENAI, Engine.LOCAL].map((engine) => ({
            label: engineOption(appConfig, engine).label,
            value: engine,
          }))}
          onSelect={(value) => {
            const engine = value as Engine;
            const { ready, blocker } = engineOption(appConfig, engine);
            setActiveEngine(engine);
            saveConfig({ engine });
            setStatusText(
              ready ? `Engine set to ${engineLabel(engine)}.` : `Engine set, but ${blocker}`,
            );
            setViewMode(ViewMode.MAIN);
          }}
          onCancel={() => setViewMode(ViewMode.MAIN)}
        />
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
      {viewMode === ViewMode.GLOSSARIES && (
        <Text dimColor>
          Edit one with: transcribe-cli glossary edit &lt;name&gt; · create: transcribe-cli glossary
          new &lt;name&gt;
        </Text>
      )}

      {/* ── Microphone Priority ── */}
      {viewMode === ViewMode.MICROPHONES && (
        <PriorityPicker
          title="Microphone Priority"
          devices={micDevices}
          priority={appConfig.microphonePriority}
          onConfirm={(priority) => {
            saveConfig({ microphonePriority: priority, selectedMicrophone: priority[0] ?? '' });
            const resolved = resolveMicDevice(priority, micDevices).device;
            setActiveMic(resolved);
            setStatusText(`Microphone priority saved — using ${resolved.label}.`);
            setViewMode(ViewMode.MAIN);
          }}
          onTest={(device) => {
            setPendingMic(device);
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
          onConfirm={() => setViewMode(ViewMode.MICROPHONES)}
          onCancel={() => setViewMode(ViewMode.MICROPHONES)}
        />
      )}
    </Box>
  );
}
