import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { glossarySelectionLabel } from '../utils/file-utils.js';
import { Header } from './header.js';
import { PreflightPrompt } from './preflight-prompt.js';
import { useAutoRecord } from '../hooks/use-auto-record.js';
import type { AppConfig } from '../config/config-manager.js';
import { ActionHotkey, HOTKEY_EXIT, HOTKEY_PAUSE_LABEL } from '../constants.js';
import { formatClock } from '../utils/recording-clock.js';
import {
  clipboardField,
  engineField,
  glossaryField,
  languageField,
  tookField,
  costField,
  audioLengthField,
  asideField,
} from './status-fields.js';

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
    microphoneLost,
    failedReconnects,
    elapsedSeconds,
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

      {isRecording && microphoneLost && (
        <Box flexDirection="column" marginTop={1} paddingX={2} paddingY={1} backgroundColor="red">
          <Text bold color="white">
            ⚠️ MICROPHONE DISCONNECTED — RECORDING PAUSED
          </Text>
          <Text color="white">
            {activeMic.label} stopped sending audio. Nothing you say now is being recorded.
          </Text>
          <Text color="white">
            Everything up to {formatClock(elapsedSeconds)} is saved in {currentAudioPath}
          </Text>
          {failedReconnects > 0 && (
            <Text bold color="white">
              Still no audio from it (attempt {failedReconnects}). Check that it is on and
              connected.
            </Text>
          )}
          <Text bold color="white">
            Reconnect it and press [{HOTKEY_PAUSE_LABEL}] to keep recording into the same file, or
            [Enter] to transcribe what was recorded.
          </Text>
        </Box>
      )}

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
