import { useState, useRef, useCallback } from 'react';
import fs from 'fs';
import { AudioRecorder } from '../audio/recorder.js';
import { listMicDevices, type MicDevice } from '../audio/micDevices.js';
import { WhisperTranscriber } from '../transcriber/WhisperTranscriber.js';
import { extractTextFromSrt } from '../utils/srtParser.js';
import { copyTextToClipboard } from '../utils/clipboard.js';
import { type AppConfig, ConfigManager } from '../config/configManager.js';
import { getTimestampPaths, loadGlossaryFiles, readGlossaryContent } from '../utils/fileUtils.js';
import {
  DEFAULT_DEVICE_ID,
  DEFAULT_DEVICE_LABEL,
  Encoding,
  LanguageCode,
  LANGUAGE_NAMES,
  AVAILABLE_LANGUAGES,
  TranscriptionFormat,
  ViewMode,
  MenuAction,
} from '../constants.js';

export function useTranscriberApp(appConfig: AppConfig, exit: () => void) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.MAIN);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusText, setStatusText] = useState('Ready to record.');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [clipboardEnabled, setClipboardEnabled] = useState(appConfig.autoCopy);

  const [currentAudioPath, setCurrentAudioPath] = useState('');
  const [currentSrtPath, setCurrentSrtPath] = useState('');
  const [currentTextPath, setCurrentTextPath] = useState('');

  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>(
    AVAILABLE_LANGUAGES.includes(appConfig.selectedLanguage)
      ? appConfig.selectedLanguage
      : LanguageCode.ENGLISH,
  );

  const initialGlossaries = loadGlossaryFiles(appConfig.basePath);
  const [activeGlossary, setActiveGlossary] = useState(initialGlossaries[0] ?? '');

  const initialMics = listMicDevices();
  const fallbackMic: MicDevice = { id: DEFAULT_DEVICE_ID, label: DEFAULT_DEVICE_LABEL };
  const savedMic = initialMics.find((m) => m.id === appConfig.selectedMicrophone);
  const [activeMic, setActiveMic] = useState<MicDevice>(savedMic ?? fallbackMic);
  const [pendingMic, setPendingMic] = useState<MicDevice>(savedMic ?? fallbackMic);
  const [micDevices, setMicDevices] = useState<MicDevice[]>(initialMics);
  const [glossaryFiles, setGlossaryFiles] = useState<string[]>(initialGlossaries);

  const saveConfig = useCallback(
    (updates: Partial<AppConfig>) => {
      const newConfig = { ...appConfig, ...updates };
      ConfigManager.save(newConfig);
      Object.assign(appConfig, updates); // mutate for current session ref
    },
    [appConfig],
  );

  // ── Refs ───────────────────────────────────────────────────────────────────
  const recorderRef = useRef(new AudioRecorder());
  const transcriber = useRef(new WhisperTranscriber(appConfig.apiKey));
  const recorder = recorderRef.current;
  try {
    recorder.setDevice(activeMic.id);
  } catch {
    /* recording in progress */
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleAction = useCallback(
    async (actionId: MenuAction) => {
      switch (actionId) {
        case MenuAction.RECORD:
          if (!isRecording) {
            const p = getTimestampPaths(appConfig.basePath);
            setCurrentAudioPath(p.audioPath);
            setCurrentSrtPath(p.srtPath);
            setCurrentTextPath(p.textPath);
            recorder.start(p.audioPath);
            setIsRecording(true);
            setIsPaused(false);
            setTranscriptionResult('');
            setStatusText('🔴 Recording...');
            return;
          }
          if (isPaused) {
            recorder.resume();
            setIsPaused(false);
            setStatusText('🔴 Recording...');
            return;
          }
          setStatusText('Already recording.');
          break;

        case MenuAction.PAUSE:
          if (isRecording && !isPaused) {
            recorder.pause();
            setIsPaused(true);
            setStatusText('⏸️  Paused');
            return;
          }
          setStatusText('No active recording to pause.');
          break;

        case MenuAction.STOP:
          if (isRecording) {
            await recorder.stop();
            setIsRecording(false);
            setIsPaused(false);
            setStatusText('⏹️  Stopped. File saved.');
            return;
          }
          setStatusText('No recording in progress.');
          break;

        case MenuAction.CHANGE_LANGUAGE:
          setViewMode(ViewMode.LANGUAGES);
          break;

        case MenuAction.CHANGE_GLOSSARY:
          setGlossaryFiles(loadGlossaryFiles(appConfig.basePath));
          setViewMode(ViewMode.GLOSSARIES);
          break;

        case MenuAction.CHANGE_MICROPHONE: {
          const fresh = listMicDevices();
          setMicDevices(fresh);
          setPendingMic(activeMic);
          setViewMode(ViewMode.MICROPHONES);
          break;
        }

        case MenuAction.TOGGLE_CLIPBOARD:
          setClipboardEnabled((prev) => {
            const newValue = !prev;
            saveConfig({ autoCopy: newValue });
            return newValue;
          });
          break;

        case MenuAction.TRANSCRIBE: {
          if (isRecording) {
            setStatusText('Please stop the recording before transcribing.');
            return;
          }
          if (!currentAudioPath || !fs.existsSync(currentAudioPath)) {
            setStatusText('No recent audio file found to transcribe.');
            return;
          }

          const glossaryPrompt = readGlossaryContent(appConfig.basePath, activeGlossary);
          setIsTranscribing(true);
          setStatusText(
            `⏳ Transcribing (${LANGUAGE_NAMES[activeLanguage]}${glossaryPrompt ? ' + glossary' : ''}) - Initializing...`,
          );
          try {
            const srtContent = await transcriber.current.transcribe(
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

            if (clipboardEnabled) {
              copyTextToClipboard(cleanText);
              setStatusText('✅ Transcription done — copied to clipboard.');
              return;
            }
            setStatusText('✅ Transcription completed and saved.');
          } catch (err: unknown) {
            setStatusText(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
          } finally {
            setIsTranscribing(false);
          }
          break;
        }

        case MenuAction.QUIT:
          if (isRecording) await recorder.stop();
          exit();
          break;
      }
    },
    [
      isRecording,
      isPaused,
      currentAudioPath,
      currentSrtPath,
      currentTextPath,
      activeLanguage,
      activeGlossary,
      activeMic,
      clipboardEnabled,
      recorder,
      exit,
      appConfig.basePath,
      saveConfig,
    ],
  );

  return {
    state: {
      viewMode,
      selectedIndex,
      statusText,
      isRecording,
      isPaused,
      isTranscribing,
      transcriptionResult,
      clipboardEnabled,
      currentTextPath,
      activeLanguage,
      activeGlossary,
      activeMic,
      pendingMic,
      micDevices,
      glossaryFiles,
      recorder,
    },
    actions: {
      setViewMode,
      setSelectedIndex,
      setStatusText,
      setActiveLanguage,
      setActiveGlossary,
      setActiveMic,
      setPendingMic,
      handleAction,
      saveConfig,
    },
  };
}
