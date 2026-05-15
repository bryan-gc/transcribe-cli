import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import path from 'path';
import fs from 'fs';
import { AudioRecorder } from '../audio/recorder.js';
import { playAudio, stopPlayback } from '../audio/audioPlayer.js';
import type { MicDevice } from '../audio/micDevices.js';
import { RECORDING_TICK_MS, ActionHotkey, TestStatus, PATHS } from '../constants';

interface MicTestProps {
  mic: MicDevice;
  onConfirm: () => void;
  onCancel: () => void;
}

const AUTO_STOP_SECS = 5;

export function MicTest({ mic, onConfirm, onCancel }: MicTestProps) {
  const [status, setStatus] = useState<TestStatus>(TestStatus.IDLE);
  const [hasRecording, setHasRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [errorText, setErrorText] = useState('');

  const recorderRef = useRef(new AudioRecorder());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);

  useEffect(() => {
    const recorderInstance = recorderRef.current;
    return () => {
      clearTimer();
      stoppingRef.current = true;
      recorderInstance.stop().catch(() => {});
      stopPlayback();
    };
  }, []);

  function clearTimer(): void {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startRecording(): void {
    if (status === TestStatus.RECORDING) return;
    try {
      const tmpDir = path.dirname(PATHS.TEST_FILE);
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      recorderRef.current.setDevice(mic.id);
      recorderRef.current.start(PATHS.TEST_FILE);
      setStatus(TestStatus.RECORDING);
      setElapsed(0);
      setErrorText('');

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= AUTO_STOP_SECS) stopRecording();
          return next;
        });
      }, RECORDING_TICK_MS);
    } catch (e: unknown) {
      setErrorText(`Recording error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const stopRecording = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    clearTimer();
    setStatus(TestStatus.SAVING);
    await recorderRef.current.stop();
    stoppingRef.current = false;
    setStatus(TestStatus.RECORDED);
    setHasRecording(true);
  }, []);

  async function handlePlayback(): Promise<void> {
    if (!hasRecording || !fs.existsSync(PATHS.TEST_FILE)) {
      setErrorText('No test recording found. Record first.');
      return;
    }
    setStatus(TestStatus.PLAYING);
    setErrorText('');
    try {
      await playAudio(PATHS.TEST_FILE);
    } catch (e: unknown) {
      setErrorText(`Playback error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStatus(TestStatus.RECORDED);
    }
  }

  function handleStopPlayback(): void {
    stopPlayback();
    setStatus(TestStatus.RECORDED);
  }

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
  const actions = (): React.ReactElement => {
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

      {actions()}

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
