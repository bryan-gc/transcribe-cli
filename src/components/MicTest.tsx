import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import path from 'path';
import fs from 'fs';
import { AudioRecorder } from '../audio/recorder.js';
import { playAudio, stopPlayback } from '../audio/audioPlayer.js';
import type { MicDevice } from '../audio/micDevices.js';
import { DIR, EXT, RECORDING_TICK_MS } from '../constants.js';

interface MicTestProps {
  mic: MicDevice;
  onConfirm: () => void;
  onCancel: () => void;
}

export enum TestStatus {
  IDLE = 'idle',
  RECORDING = 'recording',
  SAVING = 'saving',
  RECORDED = 'recorded',
  PLAYING = 'playing',
}

const TEST_FILE = path.resolve(process.cwd(), DIR.TMP, `mic-test${EXT.AUDIO}`);
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
      const tmpDir = path.dirname(TEST_FILE);
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      recorderRef.current.setDevice(mic.id);
      recorderRef.current.start(TEST_FILE);
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
    if (!hasRecording || !fs.existsSync(TEST_FILE)) {
      setErrorText('No test recording found. Record first.');
      return;
    }
    setStatus(TestStatus.PLAYING);
    setErrorText('');
    try {
      await playAudio(TEST_FILE);
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

    if (key.escape || k === 'c') {
      onCancel();
      return;
    }

    if (status === TestStatus.IDLE || status === TestStatus.RECORDED) {
      if (k === 'r') {
        startRecording();
        return;
      }
      if (k === 'p' && hasRecording) {
        handlePlayback();
        return;
      }
      if (k === 'b' || key.return) {
        onConfirm();
        return;
      }
    }

    if (status === TestStatus.RECORDING && k === 's') {
      stopRecording();
      return;
    }
    if (status === TestStatus.PLAYING && k === 's') {
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
        return <Text color="green">🔊 Playing back... press [s] to stop</Text>;
      case TestStatus.RECORDED:
        return <Text color="green">⏹️ Test recorded. Ready to play back or confirm.</Text>;
      default:
        return <Text dimColor>Press [r] to start a test recording.</Text>;
    }
  };

  // ─── Action list ──────────────────────────────────────────────────────────
  const actions = (): React.ReactElement => {
    switch (status) {
      case TestStatus.RECORDING:
        return <Text color="yellow">[s] Stop recording early</Text>;
      case TestStatus.SAVING:
        return (
          <Text color="yellow" dimColor>
            Saving...
          </Text>
        );
      case TestStatus.PLAYING:
        return <Text color="yellow">[s] Stop playback</Text>;
      default:
        return (
          <Box flexDirection="column">
            <Text color="cyan">
              [r] {status === TestStatus.RECORDED ? 'Record Again' : 'Record Test'}
              {'  '}
              <Text dimColor>(auto-stops at {AUTO_STOP_SECS}s)</Text>
            </Text>
            {hasRecording && <Text color="cyan">[p] Play Back</Text>}
            <Text color="green">[b] Confirm — use this microphone</Text>
            <Text color="red">[c] Cancel — choose a different mic</Text>
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
        <Text dimColor>Esc/[c] cancel · [b]/Enter confirm</Text>
      </Box>
    </Box>
  );
}
