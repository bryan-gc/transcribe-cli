import { useState, useEffect, useRef, useCallback } from 'react';
import path from 'path';
import { createTranscriber } from '../transcriber/createTranscriber.js';
import {
  describeTranscriptionError,
  describeOutcome,
  runTranscription,
  type TranscriptionOutcome,
} from '../utils/runTranscription.js';
import { prepareImportedAudio, ImportError, type ImportedAudio } from '../audio/audioImport.js';
import { audioDurationSeconds } from '../audio/audioDuration.js';
import { glossaryMetaName, readSelectedGlossaries } from '../utils/fileUtils.js';
import { estimateRun, type EngineChoice, type RunEstimate } from '../utils/estimate.js';
import { measuredSpeed, readRecentMeta } from '../utils/history.js';
import { Engine, type AppConfig } from '../config/configManager.js';
import { LANGUAGE_NAMES, PREFLIGHT_MIN_SECONDS, RecordingKind } from '../constants.js';

export interface Preflight {
  audioSeconds: number;
  rows: RunEstimate[];
  selected: number;
}

export function useImportTranscribe(
  appConfig: AppConfig,
  filePath: string,
  glossary: string,
  diarize: boolean,
  confirmLongAudio: boolean,
  exit: () => void,
) {
  const [statusText, setStatusText] = useState('Preparing the file...');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<TranscriptionOutcome | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);

  const importedRef = useRef<ImportedAudio | null>(null);
  const choiceRef = useRef<EngineChoice>({ engine: appConfig.engine, diarize });
  const startedRef = useRef(false);

  const language = appConfig.selectedLanguage;

  const transcribe = useCallback(
    async (imported: ImportedAudio) => {
      const choice = choiceRef.current;
      const glossaryPrompt = readSelectedGlossaries(
        appConfig.basePath,
        glossary,
        appConfig.useGeneralGlossary,
      );
      setIsTranscribing(true);
      setFailure(null);
      setStatusText(
        `⏳ Transcribing (${LANGUAGE_NAMES[language]}${glossaryPrompt ? ' + glossary' : ''}${choice.diarize ? ' + speakers' : ''})...`,
      );

      try {
        const transcriber = createTranscriber({ ...appConfig, engine: choice.engine });
        const outcome = await runTranscription(transcriber, {
          audioPath: imported.audioPath,
          srtPath: imported.srtPath,
          textPath: imported.textPath,
          language,
          glossary: glossaryPrompt,
          glossaryName: glossaryMetaName(glossary, appConfig.useGeneralGlossary),
          diarize: choice.diarize,
          diarizedPath: imported.diarizedPath,
          metaPath: imported.metaPath,
          basePath: appConfig.basePath,
          source: RecordingKind.IMPORTED,
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
    },
    [appConfig, glossary, language, exit],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let imported: ImportedAudio;
    try {
      setStatusText(`Copying ${path.basename(filePath)} into the archive...`);
      imported = prepareImportedAudio(filePath, appConfig.basePath);
      importedRef.current = imported;
    } catch (err: unknown) {
      setFailure(err instanceof ImportError ? err.message : String(err));
      setStatusText('❌ Could not prepare the file.');
      return;
    }

    const audioSeconds = audioDurationSeconds(imported.audioPath);
    if (confirmLongAudio && audioSeconds !== undefined && audioSeconds >= PREFLIGHT_MIN_SECONDS) {
      setPreflight(buildPreflight(audioSeconds, choiceRef.current, appConfig));
      setStatusText('Long audio — check the cost before sending it.');
      return;
    }
    void transcribe(imported);
  }, [appConfig, confirmLongAudio, filePath, transcribe]);

  return {
    state: {
      statusText,
      isTranscribing,
      transcriptionResult,
      failure,
      lastRun,
      preflight,
      engine: choiceRef.current.engine,
      language,
      glossary,
      sourceName: path.basename(filePath),
      audioPath: importedRef.current?.audioPath ?? '',
      textPath: importedRef.current?.textPath ?? '',
      canRetry: importedRef.current !== null,
    },
    actions: {
      retry: () => {
        if (importedRef.current) void transcribe(importedRef.current);
      },
      selectPreflight: (selected: number) => {
        setPreflight((p) => (p ? { ...p, selected } : p));
      },
      confirmPreflight: () => {
        if (!preflight || !importedRef.current) return;
        const row = preflight.rows[preflight.selected];
        choiceRef.current = { engine: row.engine, diarize: row.diarize };
        setPreflight(null);
        void transcribe(importedRef.current);
      },
    },
  };
}

function buildPreflight(audioSeconds: number, choice: EngineChoice, config: AppConfig): Preflight {
  const speedOf = measuredSpeed(readRecentMeta(config.basePath));
  const localModel = config.localWhisper.model;
  const choices: EngineChoice[] = [
    { engine: Engine.OPENAI, diarize: false },
    { engine: Engine.OPENAI, diarize: true },
    { engine: Engine.LOCAL, diarize: choice.engine === Engine.LOCAL && choice.diarize },
  ];
  const rows = choices.map((c) => estimateRun(audioSeconds, c, localModel, speedOf));
  const selected = Math.max(
    0,
    rows.findIndex((r) => r.engine === choice.engine && r.diarize === choice.diarize),
  );
  return { audioSeconds, rows, selected };
}
