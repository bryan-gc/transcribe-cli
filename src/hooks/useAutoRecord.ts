import { useState, useEffect, useRef } from 'react';
import fs from 'fs';
import { AudioRecorder } from '../audio/recorder.js';
import { WhisperTranscriber } from '../transcriber/WhisperTranscriber.js';
import { describeTranscriptionError, runTranscription } from '../utils/runTranscription.js';
import type { AppConfig } from '../config/configManager.js';
import { listMicDevices } from '../audio/micDevices.js';
import { getTimestampPaths, readGlossaryContent, getInitialGlossary } from '../utils/fileUtils.js';
import { LANGUAGE_NAMES } from '../constants.js';

export function useAutoRecord(appConfig: AppConfig, exit: () => void) {
  const [statusText, setStatusText] = useState('Initializing recording...');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const [currentAudioPath, setCurrentAudioPath] = useState('');
  const [currentSrtPath, setCurrentSrtPath] = useState('');
  const [currentTextPath, setCurrentTextPath] = useState('');

  const recorderRef = useRef<AudioRecorder | null>(null);
  const transcriberRef = useRef<WhisperTranscriber | null>(null);

  const activeLanguage = appConfig.selectedLanguage;
  const activeMicId = appConfig.selectedMicrophone;

  const mics = listMicDevices();
  const activeMic = mics.find((m) => m.id === activeMicId) ?? {
    id: activeMicId,
    label: activeMicId,
  };

  const activeGlossary = getInitialGlossary(appConfig.basePath);

  useEffect(() => {
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    transcriberRef.current = new WhisperTranscriber(appConfig.apiKey);

    try {
      recorder.setDevice(activeMic.id);
    } catch {
      // Ignore if device fails, recorder will try default
    }

    const p = getTimestampPaths(appConfig.basePath);
    setCurrentAudioPath(p.audioPath);
    setCurrentSrtPath(p.srtPath);
    setCurrentTextPath(p.textPath);

    recorder.start(p.audioPath);
    setIsRecording(true);
    setStatusText('🔴 Recording... Press [Enter] to stop and transcribe.');

    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
      }
    };
  }, [appConfig, activeMic.id]);

  const transcribe = async () => {
    if (!transcriberRef.current) return;

    const glossaryPrompt = readGlossaryContent(appConfig.basePath, activeGlossary);
    setIsTranscribing(true);
    setFailure(null);
    setStatusText(
      `⏳ Transcribing (${LANGUAGE_NAMES[activeLanguage]}${glossaryPrompt ? ' + glossary' : ''})...`,
    );

    try {
      const cleanText = await runTranscription(transcriberRef.current, {
        audioPath: currentAudioPath,
        srtPath: currentSrtPath,
        textPath: currentTextPath,
        language: activeLanguage,
        glossary: glossaryPrompt,
        copyToClipboard: appConfig.autoCopy,
        onProgress: (msg) => setStatusText(`⏳ ${msg}`),
      });

      setTranscriptionResult(cleanText);
      setStatusText(
        appConfig.autoCopy
          ? '✅ Transcription done — copied to clipboard.'
          : '✅ Transcription completed and saved.',
      );
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

    await recorderRef.current.stop();
    recorderRef.current = null;

    if (!fs.existsSync(currentAudioPath)) {
      setIsTranscribing(false);
      setFailure('The recording produced no audio file. Check the microphone with --manual.');
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
