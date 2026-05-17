import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useMicTest } from '../hooks/useMicTest.js';
import type { MicDevice } from '../audio/micDevices.js';
import { ActionHotkey, TestStatus } from '../constants.js';

interface MicTestProps {
  mic: MicDevice;
  basePath: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MicTest({ mic, basePath, onConfirm, onCancel }: MicTestProps) {
  const { state, actions } = useMicTest(mic, basePath);
  const { status, hasRecording, elapsed, errorText, AUTO_STOP_SECS } = state;
  const { startRecording, stopRecording, handlePlayback, handleStopPlayback } = actions;

  useInput((input, key) => {
    const k = input.toLowerCase();

    if (key.escape || k === ActionHotkey.CANCEL_C) {
      onCancel();
      return;
    }

    if (status === TestStatus.IDLE || status === TestStatus.RECORDED) {
      if (k === ActionHotkey.RECORD) {
        startRecording();
        return;
      }
      if (k === ActionHotkey.PLAYBACK && hasRecording) {
        handlePlayback();
        return;
      }
      if (k === ActionHotkey.CONFIRM || key.return) {
        onConfirm();
        return;
      }
    }

    if (status === TestStatus.RECORDING && k === ActionHotkey.STOP) {
      stopRecording();
      return;
    }
    if (status === TestStatus.PLAYING && k === ActionHotkey.STOP) {
      handleStopPlayback();
      return;
    }
  });

  // ─── Status line ──────────────────────────────────────────────────────────
  const statusLine = (): React.ReactElement => {
    switch (status) {
      case TestStatus.RECORDING:
        return (
          <Text color="red">
            🔴 Recording... {elapsed}s / {AUTO_STOP_SECS}s (auto-stops)
          </Text>
        );
      case TestStatus.SAVING:
        return <Text color="yellow">💾 Saving audio file, please wait...</Text>;
      case TestStatus.PLAYING:
        return <Text color="green">🔊 Playing back... press [{ActionHotkey.STOP}] to stop</Text>;
      case TestStatus.RECORDED:
        return <Text color="green">⏹️ Test recorded. Ready to play back or confirm.</Text>;
      default:
        return <Text dimColor>Press [{ActionHotkey.RECORD}] to start a test recording.</Text>;
    }
  };

  // ─── Action list ──────────────────────────────────────────────────────────
  const actionList = (): React.ReactElement => {
    switch (status) {
      case TestStatus.RECORDING:
        return <Text color="yellow">[{ActionHotkey.STOP}] Stop recording early</Text>;
      case TestStatus.SAVING:
        return (
          <Text color="yellow" dimColor>
            Saving...
          </Text>
        );
      case TestStatus.PLAYING:
        return <Text color="yellow">[{ActionHotkey.STOP}] Stop playback</Text>;
      default:
        return (
          <Box flexDirection="column">
            <Text color="cyan">
              [{ActionHotkey.RECORD}]{' '}
              {status === TestStatus.RECORDED ? 'Record Again' : 'Record Test'}
              {'  '}
              <Text dimColor>(auto-stops at {AUTO_STOP_SECS}s)</Text>
            </Text>
            {hasRecording && <Text color="cyan">[{ActionHotkey.PLAYBACK}] Play Back</Text>}
            <Text color="green">[{ActionHotkey.CONFIRM}] Confirm — use this microphone</Text>
            <Text color="red">[{ActionHotkey.CANCEL_C}] Cancel — choose a different mic</Text>
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold>{'=== Microphone Test ==='}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Microphone: <Text color="magenta">{mic.label}</Text>
        </Text>
        <Text>
          Device ID: <Text dimColor>{mic.id}</Text>
        </Text>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        {statusLine()}
      </Box>

      {actionList()}

      {errorText !== '' && (
        <Box marginTop={1}>
          <Text color="red">⚠️ {errorText}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Esc/[{ActionHotkey.CANCEL_C}] cancel · [{ActionHotkey.CONFIRM}]/Enter confirm
        </Text>
      </Box>
    </Box>
  );
}
