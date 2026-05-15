import path from 'path';

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

/** Resolved paths used globally */
export const PATHS = {
  GLOSSARIES_DIR: path.resolve(process.cwd(), DIR.GLOSSARIES),
  TEST_FILE: path.resolve(process.cwd(), DIR.TMP, `mic-test${EXT.AUDIO}`),
} as const;

/** Sentinel value used by the Picker component's "go back" option. */
export const BACK_OPTION_VALUE = '__back__' as const;

/** Sentinel value used for "none" options in pickers. */
export const NONE_OPTION_VALUE = '__none__' as const;

/** Default ALSA/system audio device name and label. */
export const DEFAULT_DEVICE_ID = 'default' as const;
export const DEFAULT_DEVICE_LABEL = 'Default Device' as const;

/** Hotkey character for ctrl+c exit */
export const HOTKEY_EXIT = 'c' as const;

/** Duration of a single tick in the recording countdown timer (ms). */
export const RECORDING_TICK_MS = 1000 as const;

export enum Platform {
  LINUX = 'linux',
  DARWIN = 'darwin',
}

export enum Cmd {
  SOX = 'sox',
  ARECORD = 'arecord',
  PLAY = 'play',
  APLAY = 'aplay',
  AFPLAY = 'afplay',
  PW_DUMP = 'pw-dump',
  SYSTEM_PROFILER = 'system_profiler',
}

export enum Signal {
  SIGINT = 'SIGINT',
  SIGTERM = 'SIGTERM',
  SIGSTOP = 'SIGSTOP',
  SIGCONT = 'SIGCONT',
}

export const AUDIO_CONFIG = {
  SAMPLE_RATE: '16000',
  CHANNELS: '1',
  BITS: '16',
  TYPE: 'wav',
  ENCODING_SOX: 'signed-integer',
  FORMAT_ARECORD: 'S16_LE',
  DEVICE_PULSE: 'pulse',
} as const;

export const ALSA_PREFIXES = {
  ALSA_INPUT: 'alsa_input.',
  BLUEZ_INPUT: 'bluez_input.',
} as const;

export enum StdioOption {
  IGNORE = 'ignore',
  PIPE = 'pipe',
}

export enum ProcessEvent {
  EXIT = 'exit',
  CLOSE = 'close',
  ERROR = 'error',
}

export enum StreamEvent {
  FINISH = 'finish',
  CLOSE = 'close',
  ERROR = 'error',
}

export enum Encoding {
  UTF8 = 'utf-8',
  BINARY = 'binary',
}

export enum AlsaDevice {
  PULSE = 'pulse',
  PIPEWIRE = 'pipewire',
  PLUGHW = 'plughw',
  HW = 'hw',
  SYSDEFAULT = 'sysdefault',
  DSNOOP = 'dsnoop',
}

export const ALSA_VIRTUAL_DEVICES = new Set([
  'null',
  'lavrate',
  'samplerate',
  'speexrate',
  'jack',
  'oss',
  'speex',
  'upmix',
  'vdownmix',
]);

export enum ActionHotkey {
  CANCEL_C = 'c',
  CANCEL_Q = 'q',
  RECORD = 'r',
  PLAYBACK = 'p',
  STOP = 's',
  CONFIRM = 'b',
}

// ─── Transcriber Constants ────────────────────────────────────────────────────
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

export enum TranscriptionFormat {
  TEXT = 'text',
  SRT = 'srt',
}

export const WHISPER_MODEL = 'whisper-1' as const;

// ─── UI Constants ─────────────────────────────────────────────────────────────

export enum ViewMode {
  MAIN = 'MAIN',
  LANGUAGES = 'LANGUAGES',
  GLOSSARIES = 'GLOSSARIES',
  MICROPHONES = 'MICROPHONES',
  MIC_TEST = 'MIC_TEST',
}

export enum MenuAction {
  RECORD = 'r',
  PAUSE = 'p',
  STOP = 's',
  TRANSCRIBE = 't',
  CHANGE_LANGUAGE = 'l',
  CHANGE_GLOSSARY = 'g',
  CHANGE_MICROPHONE = 'm',
  TOGGLE_CLIPBOARD = 'c',
  QUIT = 'q',
}

export enum TestStatus {
  IDLE = 'idle',
  RECORDING = 'recording',
  SAVING = 'saving',
  RECORDED = 'recorded',
  PLAYING = 'playing',
}
