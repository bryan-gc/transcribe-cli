import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import { Header } from './Header.js';
import { useAutoRecord } from '../hooks/useAutoRecord.js';
import type { AppConfig } from '../config/configManager.js';
import { EXT, HOTKEY_EXIT } from '../constants.js';

export function AutoRecordApp({ appConfig }: { appConfig: AppConfig }) {
  const { exit } = useApp();
  const { state, actions } = useAutoRecord(appConfig, exit);

  const {
    statusText,
    isRecording,
    isTranscribing,
    transcriptionResult,
    activeLanguage,
    activeMic,
    activeGlossary,
    currentTextPath,
  } = state;

  const { handleStopAndTranscribe, forceStop } = actions;

  useInput(
    (input, key) => {
      if (key.return) {
        handleStopAndTranscribe();
      }
      if (key.ctrl && input === HOTKEY_EXIT) {
        forceStop();
        exit();
      }
    },
    { isActive: isRecording && !isTranscribing },
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
