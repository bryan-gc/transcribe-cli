import { useState, useRef, useCallback } from 'react';
import fs from 'fs';
import { AudioRecorder } from '../audio/recorder.js';
import { listMicDevices, resolveMicDevice, type MicDevice } from '../audio/micDevices.js';
import { createTranscriber } from '../transcriber/createTranscriber.js';
import {
  describeTranscriptionError,
  describeOutcome,
  runTranscription,
} from '../utils/runTranscription.js';
import type { Engine } from '../config/configManager.js';
import { type AppConfig, ConfigManager } from '../config/configManager.js';
import {
  getTimestampPaths,
  loadGlossaryFiles,
  readGlossaryContent,
  glossaryNameOf,
} from '../utils/fileUtils.js';
import {
  LanguageCode,
  LANGUAGE_NAMES,
  AVAILABLE_LANGUAGES,
  RecordingKind,
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
  const [wrapEnabled, setWrapEnabled] = useState(appConfig.wrapClipboard);
  const [activeEngine, setActiveEngine] = useState<Engine>(appConfig.engine);

  const [currentAudioPath, setCurrentAudioPath] = useState('');
  const [currentSrtPath, setCurrentSrtPath] = useState('');
  const [currentTextPath, setCurrentTextPath] = useState('');
  const [currentMetaPath, setCurrentMetaPath] = useState('');

  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>(
    AVAILABLE_LANGUAGES.includes(appConfig.selectedLanguage)
      ? appConfig.selectedLanguage
      : LanguageCode.ENGLISH,
  );

  const initialGlossaries = loadGlossaryFiles(appConfig.basePath);
  const [activeGlossary, setActiveGlossary] = useState(initialGlossaries[0] ?? '');

  const initialMics = listMicDevices();
  const initialMic = resolveMicDevice(appConfig.microphonePriority, initialMics).device;
  const [activeMic, setActiveMic] = useState<MicDevice>(initialMic);
  const [pendingMic, setPendingMic] = useState<MicDevice>(initialMic);
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
  const transcriber = useRef(createTranscriber(appConfig));
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
            setCurrentMetaPath(p.metaPath);
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

        case MenuAction.CHANGE_ENGINE:
          setViewMode(ViewMode.ENGINES);
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

        case MenuAction.TOGGLE_WRAP:
          setWrapEnabled((prev) => {
            const newValue = !prev;
            saveConfig({ wrapClipboard: newValue });
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
            const outcome = await runTranscription(transcriber.current, {
              audioPath: currentAudioPath,
              srtPath: currentSrtPath,
              textPath: currentTextPath,
              language: activeLanguage,
              glossary: glossaryPrompt,
              glossaryName: glossaryNameOf(activeGlossary),
              metaPath: currentMetaPath,
              basePath: appConfig.basePath,
              source: RecordingKind.RECORDED,
              copyToClipboard: clipboardEnabled,
              wrap: wrapEnabled,
              onProgress: (msg) => setStatusText(`⏳ ${msg}`),
            });

            setTranscriptionResult(outcome.text);
            setStatusText(describeOutcome(outcome));
          } catch (err: unknown) {
            setStatusText(`❌ ${describeTranscriptionError(err)} Press [t] to retry.`);
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
      currentMetaPath,
      activeLanguage,
      activeGlossary,
      activeMic,
      clipboardEnabled,
      recorder,
      exit,
      appConfig.basePath,
      wrapEnabled,
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
      wrapEnabled,
      currentTextPath,
      activeLanguage,
      activeGlossary,
      activeEngine,
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
      setActiveEngine,
      setActiveMic,
      setPendingMic,
      handleAction,
      saveConfig,
    },
  };
}
