import { useState, useEffect, useRef } from 'react';
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
import { getTimestampPaths, readGlossaryContent, getInitialGlossary } from '../utils/fileUtils.js';
import { LANGUAGE_NAMES } from '../constants.js';

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

  const [currentAudioPath, setCurrentAudioPath] = useState('');
  const [currentSrtPath, setCurrentSrtPath] = useState('');
  const [currentTextPath, setCurrentTextPath] = useState('');
  const [currentDiarizedPath, setCurrentDiarizedPath] = useState('');

  const recorderRef = useRef<AudioRecorder | null>(null);
  const transcriberRef = useRef<ITranscriber | null>(null);

  const activeLanguage = appConfig.selectedLanguage;
  const { device: activeMic, isFallback: micIsFallback } = resolveMicDevice(
    appConfig.microphonePriority,
  );

  const activeGlossary = glossary || getInitialGlossary(appConfig.basePath);

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

    recorder.start(p.audioPath);
    setIsRecording(true);
    setStatusText(
      micIsFallback
        ? `🔴 Recording with ${activeMic.label} — the preferred microphone is not connected.`
        : '🔴 Recording... Press [Enter] to stop and transcribe.',
    );

    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
      }
    };
  }, [appConfig, activeMic.id, activeMic.label, micIsFallback]);

  const transcribe = async () => {
    if (!transcriberRef.current) return;

    const glossaryPrompt = readGlossaryContent(appConfig.basePath, activeGlossary);
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
        diarize,
        diarizedPath: currentDiarizedPath,
        copyToClipboard: appConfig.autoCopy,
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

    setIsRecording(false);
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
    if (recorderRef.current) recorderRef.current.stop().catch(() => {});
  };

  return {
    state: {
      statusText,
      isRecording,
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
      retry: transcribe,
      forceStop,
    },
  };
}
