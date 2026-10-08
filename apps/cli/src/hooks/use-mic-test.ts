import { useState, useRef, useEffect, useCallback } from 'react';
import fs from 'fs';
import path from 'path';
import { AudioRecorder } from '../audio/recorder.js';
import { playAudio, stopPlayback } from '../audio/audio-player.js';
import type { MicDevice } from '../audio/mic-devices.js';
import { RECORDING_TICK_MS, TestStatus, getPaths } from '../constants.js';

export function useMicTest(mic: MicDevice, basePath: string) {
  const AUTO_STOP_SECS = 5;
  const [status, setStatus] = useState<TestStatus>(TestStatus.IDLE);
  const [hasRecording, setHasRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [errorText, setErrorText] = useState('');

  const testFilePath = getPaths(basePath).TEST_FILE;
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
      const tmpDir = path.dirname(testFilePath);
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      recorderRef.current.setDevice(mic.id);
      recorderRef.current.start(testFilePath);
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
    if (!hasRecording || !fs.existsSync(testFilePath)) {
      setErrorText('No test recording found. Record first.');
      return;
    }
    setStatus(TestStatus.PLAYING);
    setErrorText('');
    try {
      await playAudio(testFilePath);
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

  return {
    state: {
      status,
      hasRecording,
      elapsed,
      errorText,
      AUTO_STOP_SECS,
    },
    actions: {
      startRecording,
      stopRecording,
      handlePlayback,
      handleStopPlayback,
    },
  };
}
