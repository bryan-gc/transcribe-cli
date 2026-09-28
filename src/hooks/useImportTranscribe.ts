import fs from 'fs';
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
import type { EngineChoice } from '../utils/estimate.js';
import { buildPreflight, type Preflight } from '../utils/preflight.js';
import type { RetryTarget } from '../utils/retryTarget.js';
import type { AppConfig } from '../config/configManager.js';
import {
  Cmd,
  DIR,
  EXT,
  LANGUAGE_NAMES,
  PREFLIGHT_MIN_SECONDS,
  RecordingKind,
} from '../constants.js';
import { playAudio, stopPlayback } from '../audio/audioPlayer.js';
import { convertAudio } from '../audio/compress.js';
import { resolveBinary } from '../system/dependencies.js';
import {
  applySpeakerNames,
  readSpeakerSegments,
  type SpeakerNames,
} from '../speakers/renameSpeakers.js';
import {
  cutSpeakerClips,
  summarizeSpeakers,
  type SpeakerSummary,
} from '../speakers/speakerSummary.js';
import { formatDiarized } from '../utils/diarizedParser.js';
import { copyTextToClipboard } from '../utils/clipboard.js';
import { wrapTranscript } from '../utils/transcriptWrapper.js';

export function useImportTranscribe(
  appConfig: AppConfig,
  filePath: string,
  glossary: string,
  diarize: boolean,
  confirmLongAudio: boolean,
  nameSpeakers: boolean,
  aside: boolean,
  exit: () => void,
  retryOf?: RetryTarget,
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

  const [naming, setNaming] = useState<SpeakerNamingState | null>(null);
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
          source: retryOf?.source ?? RecordingKind.IMPORTED,
          aside: aside || retryOf?.aside === true,
          copyToClipboard: appConfig.autoCopy,
          wrap: appConfig.wrapClipboard,
          glossaryLearning: appConfig.autoGlossary,
          onProgress: (msg) => setStatusText(`⏳ ${msg}`),
        });

        if (retryOf && !outcome.meta.diarized) fs.rmSync(imported.diarizedPath, { force: true });
        setTranscriptionResult(outcome.text);
        setLastRun(outcome);
        setStatusText(describeOutcome(outcome));
        const naming =
          nameSpeakers && outcome.meta.diarized ? prepareNaming(imported, appConfig) : null;
        if (naming) {
          setNaming(naming);
          setStatusText('Name the voices, or press q to keep the labels.');
        } else {
          setTimeout(exit, 500);
        }
      } catch (err: unknown) {
        setFailure(describeTranscriptionError(err));
        setStatusText('❌ Transcription failed. Pick an engine to try again.');
        setPreflight(
          buildPreflight(
            audioDurationSeconds(imported.audioPath) ?? 0,
            { engine: appConfig.engine, diarize },
            appConfig,
          ),
        );
      } finally {
        setIsTranscribing(false);
      }
    },
    [appConfig, glossary, language, exit, nameSpeakers, aside, retryOf, diarize],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let imported: ImportedAudio;
    try {
      setStatusText(
        retryOf
          ? `Transcribing ${path.basename(retryOf.audioPath)} again...`
          : `Copying ${path.basename(filePath)} into the archive...`,
      );
      imported = retryOf ?? prepareImportedAudio(filePath, appConfig.basePath);
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
  }, [appConfig, confirmLongAudio, filePath, retryOf, transcribe]);

  return {
    state: {
      statusText,
      isTranscribing,
      transcriptionResult,
      failure,
      lastRun,
      preflight,
      engine: choiceRef.current.engine,
      isRetry: retryOf !== undefined,
      language,
      glossary,
      sourceName: path.basename(retryOf?.audioPath ?? filePath),
      audioPath: importedRef.current?.audioPath ?? '',
      textPath: importedRef.current?.textPath ?? '',
      naming,
    },
    actions: {
      playClip: (clip: string) => {
        playAudio(clip).catch(() => setStatusText('⚠️ Could not play the clip.'));
      },
      finishNaming: async (names: SpeakerNames | undefined) => {
        stopPlayback();
        const current = naming;
        setNaming(null);
        if (current && names && Object.values(names).some(Boolean)) {
          const renamed = applySpeakerNames(current.stem, names);
          const text = formatDiarized(renamed);
          setTranscriptionResult(text);
          if (appConfig.autoCopy) {
            await copyTextToClipboard(
              appConfig.wrapClipboard ? wrapTranscript(text, { language, diarized: true }) : text,
            ).catch(() => undefined);
          }
          setStatusText('✅ Speakers named and saved.');
        }
        setTimeout(exit, 500);
      },
      selectPreflight: (selected: number) => {
        setPreflight((p) => (p ? { ...p, selected } : p));
      },
      confirmPreflight: () => {
        if (!preflight || !importedRef.current) return;
        const row = preflight.rows[preflight.selected];
        choiceRef.current = { engine: row.engine, diarize: row.diarize };
        setPreflight(null);
        setFailure(null);
        void transcribe(importedRef.current);
      },
    },
  };
}

const VOICE_CLIPS_DIR = 'voices';

export interface SpeakerNamingState {
  stem: string;
  speakers: SpeakerSummary[];
  clips: Record<string, string>;
}

function prepareNaming(imported: ImportedAudio, config: AppConfig): SpeakerNamingState | null {
  const stem = imported.textPath.slice(0, -EXT.TEXT.length);
  const segments = readSpeakerSegments(stem);
  if (segments.length === 0) return null;
  const ffmpeg = resolveBinary(Cmd.FFMPEG);
  const dir = path.join(config.basePath, DIR.CACHE, VOICE_CLIPS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const clips = ffmpeg
    ? cutSpeakerClips(imported.audioPath, segments, dir, (source, target, from, to) =>
        convertAudio(ffmpeg, source, target, false, { from, to }),
      )
    : {};
  return { stem, speakers: summarizeSpeakers(segments), clips };
}
