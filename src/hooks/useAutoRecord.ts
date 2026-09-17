import { useState, useEffect, useRef } from 'react';
import fs from 'fs';
import { AudioRecorder } from '../audio/recorder.js';
import { createTranscriber } from '../transcriber/createTranscriber.js';
import type { ITranscriber } from '../transcriber/ITranscriber.js';
import {
  describeTranscriptionError,
  describeOutcome,
  runTranscription,
  type TranscriptionOutcome,
} from '../utils/runTranscription.js';
import type { AppConfig } from '../config/configManager.js';
import { resolveMicDevice } from '../audio/micDevices.js';
import { getTimestampPaths, readSelectedGlossaries, glossaryMetaName } from '../utils/fileUtils.js';
import { RecordingClock, formatClock } from '../utils/recordingClock.js';
import { estimateRun, formatEstimatedCost, formatEstimatedTime } from '../utils/estimate.js';
import { measuredSpeed, readRecentMeta } from '../utils/history.js';
import { Engine } from '../config/configManager.js';
import {
  HOTKEY_PAUSE_LABEL,
  LANGUAGE_NAMES,
  RECORDING_TICK_MS,
  RESUME_STALL_CHECK_MS,
  RecordingKind,
} from '../constants.js';

export function useAutoRecord(
  appConfig: AppConfig,
  glossary: string,
  diarize: boolean,
  exit: () => void,
) {
  const [statusText, setStatusText] = useState('Initializing recording...');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<TranscriptionOutcome | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [stalledAfterResume, setStalledAfterResume] = useState(false);

  const [currentAudioPath, setCurrentAudioPath] = useState('');
  const [currentSrtPath, setCurrentSrtPath] = useState('');
  const [currentTextPath, setCurrentTextPath] = useState('');
  const [currentDiarizedPath, setCurrentDiarizedPath] = useState('');
  const [currentMetaPath, setCurrentMetaPath] = useState('');

  const recorderRef = useRef<AudioRecorder | null>(null);
  const transcriberRef = useRef<ITranscriber | null>(null);
  const clockRef = useRef(new RecordingClock());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedOfRef = useRef(measuredSpeed(readRecentMeta(appConfig.basePath)));

  const activeLanguage = appConfig.selectedLanguage;
  const { device: activeMic, isFallback: micIsFallback } = resolveMicDevice(
    appConfig.microphonePriority,
  );

  const activeGlossary = glossary;

  useEffect(() => {
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    transcriberRef.current = createTranscriber(appConfig);

    try {
      recorder.setDevice(activeMic.id);
    } catch {
      // Ignore if device fails, recorder will try default
    }

    const p = getTimestampPaths(appConfig.basePath);
    setCurrentAudioPath(p.audioPath);
    setCurrentSrtPath(p.srtPath);
    setCurrentTextPath(p.textPath);
    setCurrentDiarizedPath(p.diarizedPath);
    setCurrentMetaPath(p.metaPath);

    recorder.start(p.audioPath);
    setIsRecording(true);

    const clock = new RecordingClock();
    clockRef.current = clock;
    const timer = setInterval(() => setElapsedSeconds(clock.tick()), RECORDING_TICK_MS);
    timerRef.current = timer;

    return () => {
      clearInterval(timer);
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
      }
    };
  }, [appConfig, activeMic.id]);

  const stopClock = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder || !isRecording || isTranscribing) return;

    if (!isPaused) {
      recorder.pause();
      clockRef.current.pause();
      setIsPaused(true);
      return;
    }

    recorder.resume();
    clockRef.current.resume();
    setIsPaused(false);
    setStalledAfterResume(false);

    const audioPath = recorder.getFilepath();
    const sizeAtResume = fileSize(audioPath);
    setTimeout(() => {
      const stillRecording = recorderRef.current === recorder && !clockRef.current.isPaused;
      if (stillRecording && fileSize(audioPath) === sizeAtResume) setStalledAfterResume(true);
    }, RESUME_STALL_CHECK_MS);
  };

  const recordingLine = () => {
    if (stalledAfterResume) {
      return '⚠️ No audio since resuming — the microphone may have dropped. [Enter] keeps what was recorded.';
    }
    const label = isPaused ? '⏸  Paused' : '🔴 Recording';
    const micNote = micIsFallback ? ` with ${activeMic.label} (preferred mic not connected)` : '';
    const help = `[${HOTKEY_PAUSE_LABEL}] ${isPaused ? 'resume' : 'pause'} · [Enter] stop and transcribe`;
    return `${label}   ${formatClock(elapsedSeconds)}${micNote}${liveEstimate()}   ·   ${help}`;
  };

  const liveEstimate = () => {
    if (elapsedSeconds === 0) return '';
    const localModel = appConfig.localWhisper.model;
    const speedOf = speedOfRef.current;
    const api = estimateRun(
      elapsedSeconds,
      { engine: Engine.OPENAI, diarize },
      localModel,
      speedOf,
    );
    const local = estimateRun(
      elapsedSeconds,
      { engine: Engine.LOCAL, diarize },
      localModel,
      speedOf,
    );
    return `   ·   ${formatEstimatedCost(api.cost)} with ${api.model}   ·   ${formatEstimatedTime(local)} locally`;
  };

  const transcribe = async () => {
    if (!transcriberRef.current) return;

    const glossaryPrompt = readSelectedGlossaries(
      appConfig.basePath,
      activeGlossary,
      appConfig.useGeneralGlossary,
    );
    setIsTranscribing(true);
    setFailure(null);
    setStatusText(
      `⏳ Transcribing (${LANGUAGE_NAMES[activeLanguage]}${glossaryPrompt ? ' + glossary' : ''}${diarize ? ' + speakers' : ''})...`,
    );

    try {
      const outcome = await runTranscription(transcriberRef.current, {
        audioPath: currentAudioPath,
        srtPath: currentSrtPath,
        textPath: currentTextPath,
        language: activeLanguage,
        glossary: glossaryPrompt,
        glossaryName: glossaryMetaName(activeGlossary, appConfig.useGeneralGlossary),
        diarize,
        diarizedPath: currentDiarizedPath,
        metaPath: currentMetaPath,
        basePath: appConfig.basePath,
        source: RecordingKind.RECORDED,
        copyToClipboard: appConfig.autoCopy,
        wrap: appConfig.wrapClipboard,
        onProgress: (msg) => setStatusText(`⏳ ${msg}`),
      });

      setTranscriptionResult(outcome.text);
      setLastRun(outcome);
      setStatusText(describeOutcome(outcome));
      setTimeout(exit, 500);
    } catch (err: unknown) {
      setFailure(describeTranscriptionError(err));
      setStatusText('❌ Transcription failed.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleStopAndTranscribe = async () => {
    if (!recorderRef.current || !transcriberRef.current || !isRecording || isTranscribing) {
      return;
    }

    stopClock();
    setIsRecording(false);
    setIsPaused(false);
    setIsTranscribing(true);
    setStatusText('⏹️  Stopped recording. Saving file...');

    const recorder = recorderRef.current;
    await recorder.stop();
    recorderRef.current = null;

    const recordingFailure = recorder.getFailure();
    if (recordingFailure) {
      setIsTranscribing(false);
      setFailure(recordingFailure.message);
      setStatusText('❌ Nothing was recorded.');
      return;
    }

    await transcribe();
  };

  const forceStop = () => {
    stopClock();
    if (recorderRef.current) recorderRef.current.stop().catch(() => {});
  };

  return {
    state: {
      statusText: isRecording ? recordingLine() : statusText,
      isRecording,
      isPaused,
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
    },
    actions: {
      handleStopAndTranscribe,
      togglePause,
      retry: transcribe,
      forceStop,
    },
  };
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}
