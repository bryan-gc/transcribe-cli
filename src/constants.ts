import path from 'path';

/** Names of directories used by the application under the configured base path. */
export const DIR = {
  DATA: 'transcriptions',
  GLOSSARIES: 'glossaries',
  CACHE: '.cache',
} as const;

/**
 * Where a recording came from. Live recordings and files handed to the tool end up in separate
 * subdirectories so the archive stays legible once both exist.
 */
export enum RecordingKind {
  RECORDED = 'recorded',
  IMPORTED = 'imported',
}

/**
 * What DIR.DATA used to be called. Kept only so an installation created before the rename can be
 * migrated once; nothing writes here.
 */
export const LEGACY_DATA_DIR = 'tmp' as const;

/**
 * Extensions the transcription API accepts as an upload. Anything else has to be converted first.
 */
export const SUPPORTED_IMPORT_EXT = new Set([
  '.mp3',
  '.mp4',
  '.mpeg',
  '.mpga',
  '.m4a',
  '.wav',
  '.webm',
  '.flac',
  '.ogg',
]);

/** Hard limit the API puts on an uploaded file. Larger recordings are compressed first. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** File extensions the app reads or writes. */
export const EXT = {
  AUDIO: '.wav',
  SUBTITLES: '.srt',
  TEXT: '.txt',
  GLOSSARY: '.txt',
  DIARIZED: '.json',
} as const;

export function getPaths(basePath: string) {
  return {
    GLOSSARIES_DIR: path.resolve(basePath, DIR.GLOSSARIES),
    // The microphone test is the one genuinely disposable file, so it lives apart from the archive.
    TEST_FILE: path.resolve(basePath, DIR.CACHE, `mic-test${EXT.AUDIO}`),
  };
}

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

/** Size of a wav header on its own: a file this small contains no audio. */
export const WAV_HEADER_BYTES = 44 as const;

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
  FFMPEG = 'ffmpeg',
  XCLIP = 'xclip',
  XSEL = 'xsel',
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
  DIARIZED = 'diarized_json',
}

export const WHISPER_MODEL = 'whisper-1' as const;

/** Speaker labelling needs a different model; whisper-1 has no notion of who is talking. */
export const DIARIZE_MODEL = 'gpt-4o-transcribe-diarize' as const;

/** Required by the diarizing model for anything longer than 30 seconds. */
export const DIARIZE_CHUNKING = 'auto' as const;

/** Below this a subtitle flashes past unread, so short segments are merged up to it. */
export const MIN_SUBTITLE_SEC = 1.2;

/** Two lines of roughly 42 characters, the usual ceiling for a readable subtitle. */
export const SUBTITLE_MAX_CHARS = 84;

/** Attempts the SDK makes on its own for connection errors, 429 and 5xx before giving up. */
export const SDK_MAX_RETRIES = 3 as const;

/**
 * Ten minutes is the SDK default and is not enough: uploading and processing a long recording can
 * take longer than that, and timing out there wastes the whole upload.
 */
export const REQUEST_TIMEOUT_MS = 20 * 60 * 1000;

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
