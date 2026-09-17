import { LanguageCode } from '../constants.js';

export const WRAP_GLOSSARY_MAX_CHARS = 300;
export const WRAP_DURATION_MIN_SECONDS = 10 * 60;

export interface WrapInfo {
  language: LanguageCode;
  glossaryUsed?: string;
  diarized: boolean;
  audioSeconds?: number;
}

interface WrapTexts {
  header: string;
  speakers: string;
  duration: (length: string) => string;
  footer: string;
  glossary: (terms: string) => string;
}

const SPANISH: WrapTexts = {
  header:
    '[TRANSCRIPCIÓN AUTOMÁTICA — voz a texto, sin revisar. Puede tener palabras cambiadas, nombres mal escritos o frases cortadas; interpretar con criterio.]',
  speakers: '[Hablantes etiquetados automáticamente; la atribución puede fallar.]',
  duration: (length) => `[Duración del audio: ${length}]`,
  footer: '[FIN DE LA TRANSCRIPCIÓN]',
  glossary: (terms) => `[Glosario usado como referencia de ortografía: ${terms}]`,
};

const ENGLISH: WrapTexts = {
  header:
    '[AUTOMATIC TRANSCRIPTION — speech to text, unreviewed. It may contain wrong words, misspelled names or cut-off sentences; read with judgement.]',
  speakers: '[Speakers labelled automatically; attribution may be wrong.]',
  duration: (length) => `[Audio length: ${length}]`,
  footer: '[END OF TRANSCRIPTION]',
  glossary: (terms) => `[Glossary used as a spelling reference: ${terms}]`,
};

export function wrapTranscript(text: string, info: WrapInfo): string {
  const texts = info.language === LanguageCode.SPANISH ? SPANISH : ENGLISH;
  const head = [texts.header];
  if (info.diarized) head.push(texts.speakers);
  if (info.audioSeconds !== undefined && info.audioSeconds > WRAP_DURATION_MIN_SECONDS) {
    head.push(texts.duration(formatAudioLength(info.audioSeconds)));
  }

  const tail = [texts.footer];
  const terms = glossaryTerms(info.glossaryUsed);
  if (terms) tail.push(texts.glossary(terms));

  return `${head.join('\n')}\n\n${text}\n\n${tail.join('\n')}`;
}

export function formatAudioLength(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${minutes} min`;
}

function glossaryTerms(glossary: string | undefined): string {
  const joined = (glossary ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('; ');
  return joined.length > WRAP_GLOSSARY_MAX_CHARS
    ? `${joined.slice(0, WRAP_GLOSSARY_MAX_CHARS - 1)}…`
    : joined;
}
