import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import { Header } from './Header.js';
import { useAutoRecord } from '../hooks/useAutoRecord.js';
import type { AppConfig } from '../config/configManager.js';
import { ActionHotkey, EXT, HOTKEY_EXIT } from '../constants.js';
import {
  clipboardField,
  engineField,
  glossaryField,
  languageField,
  tookField,
  costField,
  audioLengthField,
} from './statusFields.js';

export function AutoRecordApp({
  appConfig,
  glossary,
  diarize,
}: {
  appConfig: AppConfig;
  glossary: string;
  diarize: boolean;
}) {
  const { exit } = useApp();
  const { state, actions } = useAutoRecord(appConfig, glossary, diarize, exit);

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
  } = state;

  const { handleStopAndTranscribe, togglePause, retry, forceStop } = actions;

  useInput(
    (input, key) => {
      if (key.ctrl && input === HOTKEY_EXIT) {
        forceStop();
        exit();
        return;
      }
      if (failure) {
        if (input.toLowerCase() === ActionHotkey.RECORD) retry();
        if (input.toLowerCase() === ActionHotkey.CANCEL_Q) exit();
        return;
      }
      if (key.return) handleStopAndTranscribe();
      if (input === ActionHotkey.PAUSE) togglePause();
    },
    { isActive: (isRecording || failure !== null) && !isTranscribing },
  );

  const glossaryLabel = activeGlossary ? path.basename(activeGlossary, EXT.GLOSSARY) : '(none)';

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
          clipboardField(appConfig.autoCopy, lastRun),
        ]}
      />

      {failure !== null && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">{failure}</Text>
          <Text dimColor>Audio saved at {currentAudioPath}</Text>
          <Text>
            Press [{ActionHotkey.RECORD}] to retry · [{ActionHotkey.CANCEL_Q}] to quit
          </Text>
        </Box>
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
