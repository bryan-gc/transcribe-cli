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
import { readGlossaryContent } from '../utils/fileUtils.js';
import type { AppConfig } from '../config/configManager.js';
import { LANGUAGE_NAMES } from '../constants.js';

export function useImportTranscribe(
  appConfig: AppConfig,
  filePath: string,
  glossary: string,
  diarize: boolean,
  exit: () => void,
) {
  const [statusText, setStatusText] = useState('Preparing the file...');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<TranscriptionOutcome | null>(null);

  const transcriberRef = useRef(createTranscriber(appConfig));
  const importedRef = useRef<ImportedAudio | null>(null);
  const startedRef = useRef(false);

  const language = appConfig.selectedLanguage;

  const transcribe = useCallback(
    async (imported: ImportedAudio) => {
      const glossaryPrompt = readGlossaryContent(appConfig.basePath, glossary);
      setIsTranscribing(true);
      setFailure(null);
      setStatusText(
        `⏳ Transcribing (${LANGUAGE_NAMES[language]}${glossaryPrompt ? ' + glossary' : ''}${diarize ? ' + speakers' : ''})...`,
      );

      try {
        const outcome = await runTranscription(transcriberRef.current, {
          audioPath: imported.audioPath,
          srtPath: imported.srtPath,
          textPath: imported.textPath,
          language,
          glossary: glossaryPrompt,
          diarize,
          diarizedPath: imported.diarizedPath,
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
    },
    [appConfig, glossary, language, diarize, exit],
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
    void transcribe(imported);
  }, [appConfig.basePath, filePath, transcribe]);

  return {
    state: {
      statusText,
      isTranscribing,
      transcriptionResult,
      failure,
      lastRun,
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
    },
  };
}
