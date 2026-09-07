import React from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import { Header } from './Header.js';
import { PreflightPrompt } from './PreflightPrompt.js';
import { useImportTranscribe } from '../hooks/useImportTranscribe.js';
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

export function ImportApp({
  appConfig,
  filePath,
  glossary,
  diarize,
  confirmLongAudio,
}: {
  appConfig: AppConfig;
  filePath: string;
  glossary: string;
  diarize: boolean;
  confirmLongAudio: boolean;
}) {
  const { exit } = useApp();
  const { state, actions } = useImportTranscribe(
    appConfig,
    filePath,
    glossary,
    diarize,
    confirmLongAudio,
    exit,
  );

  const {
    statusText,
    isTranscribing,
    transcriptionResult,
    failure,
    lastRun,
    preflight,
    engine,
    language,
    sourceName,
    audioPath,
    textPath,
    canRetry,
  } = state;

  useInput(
    (input, key) => {
      if (key.ctrl && input === HOTKEY_EXIT) {
        exit();
        return;
      }
      if (input.toLowerCase() === ActionHotkey.CANCEL_Q) exit();
      if (canRetry && input.toLowerCase() === ActionHotkey.RECORD) actions.retry();
    },
    { isActive: failure !== null && !isTranscribing },
  );

  const glossaryLabel = glossary ? path.basename(glossary, EXT.GLOSSARY) : '(none)';

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        title="=== transcribe-cli (Import) ==="
        statusText={statusText}
        isBusy={isTranscribing}
        fields={[
          languageField(language),
          glossaryField(glossaryLabel),
          { label: 'Audio file', value: sourceName },
          engineField(engine, lastRun),
          ...audioLengthField(lastRun),
          ...tookField(lastRun),
          ...costField(lastRun),
          clipboardField(appConfig.autoCopy, lastRun),
        ]}
      />

      {preflight !== null && (
        <PreflightPrompt
          audioSeconds={preflight.audioSeconds}
          rows={preflight.rows}
          selected={preflight.selected}
          onSelect={actions.selectPreflight}
          onConfirm={actions.confirmPreflight}
          onCancel={exit}
        />
      )}

      {failure !== null && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red">{failure}</Text>
          {audioPath !== '' && <Text dimColor>Audio saved at {audioPath}</Text>}
          <Text>
            {canRetry ? `Press [${ActionHotkey.RECORD}] to retry · ` : ''}[{ActionHotkey.CANCEL_Q}]
            to quit
          </Text>
        </Box>
      )}

      {transcriptionResult !== '' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            Transcription Result:
          </Text>
          <Text>{transcriptionResult}</Text>
          <Text dimColor>📄 {textPath}</Text>
        </Box>
      )}
    </Box>
  );
}
