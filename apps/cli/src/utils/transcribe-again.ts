import fs from 'fs';
import type { AppConfig } from '../config/config-manager.js';
import type { ITranscriber } from '../transcriber/transcriber.js';
import { createTranscriber } from '../transcriber/create-transcriber.js';
import type { EngineChoice } from './estimate.js';
import { glossaryMetaName, readSelectedGlossaries } from './file-utils.js';
import { runTranscription, type TranscriptionOutcome } from './run-transcription.js';
import { currentAttempt, keepAttempt, readMeta, type ArchiveEntry } from './archive.js';

export async function transcribeAgain(
  entry: ArchiveEntry,
  choice: EngineChoice,
  config: AppConfig,
  glossary: string,
  onProgress?: (status: string) => void,
  transcriberFor: (config: AppConfig) => ITranscriber = createTranscriber,
): Promise<TranscriptionOutcome> {
  const previous = currentAttempt(entry);
  const meta = readMeta(entry);
  const outcome = await runTranscription(transcriberFor({ ...config, engine: choice.engine }), {
    audioPath: entry.audioPath,
    srtPath: entry.srtPath,
    textPath: entry.textPath,
    language: meta?.language ?? config.selectedLanguage,
    glossary: readSelectedGlossaries(config.basePath, glossary, config.useGeneralGlossary),
    glossaryName: glossaryMetaName(glossary, config.useGeneralGlossary),
    diarize: choice.diarize,
    diarizedPath: entry.diarizedPath,
    metaPath: entry.metaPath,
    basePath: config.basePath,
    source: entry.source,
    aside: meta?.aside === true,
    copyToClipboard: config.autoCopy,
    wrap: config.wrapClipboard,
    glossaryLearning: config.autoGlossary,
    onProgress,
  });
  if (previous) keepAttempt(entry, previous);
  if (!outcome.meta.diarized) fs.rmSync(entry.diarizedPath, { force: true });
  return outcome;
}
