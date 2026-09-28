import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { glossarySelectionLabel } from '../utils/fileUtils.js';
import { Header } from './Header.js';
import { PreflightPrompt } from './PreflightPrompt.js';
import { useAutoRecord } from '../hooks/useAutoRecord.js';
import type { AppConfig } from '../config/configManager.js';
import { ActionHotkey, HOTKEY_EXIT } from '../constants.js';
import {
  clipboardField,
  engineField,
  glossaryField,
  languageField,
  tookField,
  costField,
  audioLengthField,
  asideField,
} from './statusFields.js';

export function AutoRecordApp({
  appConfig,
  glossary,
  diarize,
  aside = false,
}: {
  appConfig: AppConfig;
  glossary: string;
  diarize: boolean;
  aside?: boolean;
}) {
  const { exit } = useApp();
  const { state, actions } = useAutoRecord(appConfig, glossary, diarize, aside, exit);

  const {
    statusText,
    isRecording,
    isPaused,
    isTranscribing,
    transcriptionResult,
    failure,
    lastRun,
    currentAudioPath,
    activeLanguage,
    activeMic,
    activeGlossary,
    currentTextPath,
    retryMenu,
  } = state;

  const { handleStopAndTranscribe, togglePause, selectRetry, confirmRetry, forceStop } = actions;

  useInput(
    (input, key) => {
      if (key.ctrl && input === HOTKEY_EXIT) {
        forceStop();
        exit();
        return;
      }
      if (failure) {
        if (retryMenu === null && input.toLowerCase() === ActionHotkey.CANCEL_Q) exit();
        return;
      }
      if (key.return) handleStopAndTranscribe();
      if (input === ActionHotkey.PAUSE) togglePause();
    },
    { isActive: (isRecording || failure !== null) && !isTranscribing },
  );

  const glossaryLabel = glossarySelectionLabel(activeGlossary, appConfig.useGeneralGlossary);

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="=== transcribe-cli (Auto Record) ==="
        statusText={statusText}
        isBusy={(isRecording && !isPaused) || isTranscribing}
        fields={[
          languageField(activeLanguage),
          glossaryField(glossaryLabel, lastRun),
          { label: 'Microphone', value: activeMic.label },
          engineField(appConfig.engine, lastRun),
          ...audioLengthField(lastRun),
          ...tookField(lastRun),
          ...costField(lastRun),
          clipboardField(appConfig.autoCopy, lastRun, appConfig.wrapClipboard),
          ...asideField(aside),
        ]}
      />

      {failure !== null && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">{failure}</Text>
          <Text dimColor>Audio saved at {currentAudioPath}</Text>
          {retryMenu === null && <Text>Press [{ActionHotkey.CANCEL_Q}] to quit</Text>}
        </Box>
      )}

      {failure !== null && retryMenu !== null && !isTranscribing && (
        <PreflightPrompt
          audioSeconds={retryMenu.audioSeconds}
          rows={retryMenu.rows}
          selected={retryMenu.selected}
          onSelect={selectRetry}
          onConfirm={confirmRetry}
          onCancel={exit}
        />
      )}

      {transcriptionResult !== '' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            Transcription Result:
          </Text>
          <Text>{transcriptionResult}</Text>
          <Text dimColor>📄 {currentTextPath}</Text>
        </Box>
      )}
    </Box>
  );
}
