import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import { Header } from './Header.js';
import { useAutoRecord } from '../hooks/useAutoRecord.js';
import type { AppConfig } from '../config/configManager.js';
import { ActionHotkey, EXT, HOTKEY_EXIT } from '../constants.js';

export function AutoRecordApp({ appConfig }: { appConfig: AppConfig }) {
  const { exit } = useApp();
  const { state, actions } = useAutoRecord(appConfig, exit);

  const {
    statusText,
    isRecording,
    isTranscribing,
    transcriptionResult,
    failure,
    currentAudioPath,
    activeLanguage,
    activeMic,
    activeGlossary,
    currentTextPath,
  } = state;

  const { handleStopAndTranscribe, retry, forceStop } = actions;

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
    },
    { isActive: (isRecording || failure !== null) && !isTranscribing },
  );

  const glossaryLabel = activeGlossary ? path.basename(activeGlossary, EXT.GLOSSARY) : '(none)';

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="=== transcribe-cli (Auto Record) ==="
        statusText={statusText}
        isBusy={isRecording || isTranscribing}
        activeLanguage={activeLanguage}
        glossaryLabel={glossaryLabel}
        micLabel={activeMic.label}
        clipboardEnabled={appConfig.autoCopy}
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
