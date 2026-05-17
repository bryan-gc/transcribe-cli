import { useState, useEffect, useRef } from 'react';
import fs from 'fs';
import { AudioRecorder } from '../audio/recorder.js';
import { WhisperTranscriber } from '../transcriber/WhisperTranscriber.js';
import { extractTextFromSrt } from '../utils/srtParser.js';
import { copyTextToClipboard } from '../utils/clipboard.js';
import type { AppConfig } from '../config/configManager.js';
import { listMicDevices } from '../audio/micDevices.js';
import { getTimestampPaths, readGlossaryContent, getInitialGlossary } from '../utils/fileUtils.js';
import { Encoding, LANGUAGE_NAMES, TranscriptionFormat } from '../constants.js';

export function useAutoRecord(appConfig: AppConfig, exit: () => void) {
  const [statusText, setStatusText] = useState('Initializing recording...');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');

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

  const handleStopAndTranscribe = async () => {
    if (!recorderRef.current || !transcriberRef.current || !isRecording || isTranscribing) {
      return;
    }

    try {
      setIsRecording(false);
      setIsTranscribing(true);
      setStatusText('⏹️  Stopped recording. Saving file...');

      await recorderRef.current.stop();
      recorderRef.current = null;

      if (!fs.existsSync(currentAudioPath)) {
        setStatusText('❌ Error: Audio file was not generated.');
        setTimeout(exit, 2000);
        return;
      }

      const glossaryPrompt = readGlossaryContent(appConfig.basePath, activeGlossary);

      setStatusText(
        `⏳ Transcribing (${LANGUAGE_NAMES[activeLanguage]}${glossaryPrompt ? ' + glossary' : ''})...`,
      );

      const srtContent = await transcriberRef.current.transcribe(
        currentAudioPath,
        activeLanguage,
        TranscriptionFormat.SRT,
        glossaryPrompt,
        (msg) => setStatusText(`⏳ Transcribing: ${msg}`),
      );

      setStatusText('⏳ Formatting text and saving files...');
      fs.writeFileSync(currentSrtPath, srtContent, Encoding.UTF8);
      const cleanText = extractTextFromSrt(srtContent);
      fs.writeFileSync(currentTextPath, cleanText, Encoding.UTF8);

      setTranscriptionResult(cleanText);

      if (appConfig.autoCopy) {
        copyTextToClipboard(cleanText);
        setStatusText('✅ Transcription done — copied to clipboard.');
      } else {
        setStatusText('✅ Transcription completed and saved.');
      }

      setTimeout(exit, 500);
    } catch (err: unknown) {
      setStatusText(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      setIsTranscribing(false);
      setTimeout(exit, 3000);
    }
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
      activeLanguage,
      activeMic,
      activeGlossary,
      currentTextPath,
    },
    actions: {
      handleStopAndTranscribe,
      forceStop,
    },
  };
}
