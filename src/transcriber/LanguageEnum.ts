export enum LanguageCode {
  SPANISH = 'es',
  ENGLISH = 'en',
  PORTUGUESE = 'pt',
  FRENCH = 'fr',
  GERMAN = 'de',
}

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  [LanguageCode.SPANISH]: 'Spanish',
  [LanguageCode.ENGLISH]: 'English',
  [LanguageCode.PORTUGUESE]: 'Portuguese',
  [LanguageCode.FRENCH]: 'French',
  [LanguageCode.GERMAN]: 'German',
};

export const AVAILABLE_LANGUAGES = Object.values(LanguageCode);
