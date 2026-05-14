/** Names of directories used by the application at the project root. */
export const DIR = {
  TMP: 'tmp',
  GLOSSARIES: 'glossaries',
} as const;

/** File extensions the app reads or writes. */
export const EXT = {
  AUDIO: '.wav',
  SUBTITLES: '.srt',
  TEXT: '.txt',
  GLOSSARY: '.txt',
} as const;

/** Sentinel value used by the Picker component's "go back" option. */
export const BACK_OPTION_VALUE = '__back__' as const;

/** Default ALSA/system audio device name. */
export const DEFAULT_DEVICE_ID = 'default' as const;

/** Duration of a single tick in the recording countdown timer (ms). */
export const RECORDING_TICK_MS = 1000 as const;
