import path from 'path';

export const DIR = {
  DATA: 'transcriptions',
  GLOSSARIES: 'glossaries',
  CACHE: '.cache',
} as const;

export enum RecordingKind {
  RECORDED = 'recorded',
  IMPORTED = 'imported',
}

export const LEGACY_DATA_DIR = 'tmp' as const;

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

export const GENERAL_GLOSSARY = 'general.txt' as const;

export const GLOSSARY_NONE = 'none' as const;

export const GENERAL_GLOSSARY_HEADER = [
  '# Glossary: general',
  '# Used on every run unless you pass -g none or --no-general-glossary.',
  '# One term, name or short phrase per line, or a comma-separated list.',
  '# Lines starting with # are ignored.',
  '# Only about 220 tokens are sent: when it is longer, the TOP lines are dropped first,',
  '# so keep the most important terms at the bottom.',
  '',
].join('\n');

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** File extensions the app reads or writes. */
export const EXT = {
  AUDIO: '.wav',
  SUBTITLES: '.srt',
  TEXT: '.txt',
  GLOSSARY: '.txt',
  DIARIZED: '.json',
  META: '.meta.json',
} as const;

export function getPaths(basePath: string) {
  return {
    GLOSSARIES_DIR: path.resolve(basePath, DIR.GLOSSARIES),
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
  FFPROBE = 'ffprobe',
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
  PAUSE = ' ',
}

export const HOTKEY_PAUSE_LABEL = 'space' as const;

export const RESUME_STALL_CHECK_MS = 3000 as const;

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

export const DIARIZE_MODEL = 'gpt-4o-transcribe-diarize' as const;

export const DIARIZE_CHUNKING = 'auto' as const;

export const PRICING_CHECKED_ON = '2026-09-07' as const;

export const PRICING = {
  [WHISPER_MODEL]: { perAudioMinuteUsd: 0.006 },
  [DIARIZE_MODEL]: { perInputTokenUsd: 2.5 / 1_000_000, perOutputTokenUsd: 10 / 1_000_000 },
} as const;

export const DIARIZE_TOKENS_PER_AUDIO_MINUTE = { input: 946, output: 1881 } as const;

export const PREFLIGHT_MIN_SECONDS = 5 * 60;

export const HISTORY_SAMPLE_SIZE = 50 as const;

export const USAGE_LOG_FILE = 'usage.jsonl' as const;

export const MIN_SUBTITLE_SEC = 1.2;

export const SUBTITLE_MAX_CHARS = 84;

export const SDK_MAX_RETRIES = 3 as const;

export const REQUEST_TIMEOUT_MS = 20 * 60 * 1000;

// ─── UI Constants ─────────────────────────────────────────────────────────────

export enum ViewMode {
  MAIN = 'MAIN',
  ENGINES = 'ENGINES',
  LANGUAGES = 'LANGUAGES',
  GLOSSARIES = 'GLOSSARIES',
  CHUNK_LENGTH = 'CHUNK_LENGTH',
  MICROPHONES = 'MICROPHONES',
  MIC_TEST = 'MIC_TEST',
}

export enum MenuAction {
  CHANGE_ENGINE = 'e',
  RECORD = 'r',
  PAUSE = 'p',
  STOP = 's',
  TRANSCRIBE = 't',
  CHANGE_LANGUAGE = 'l',
  CHANGE_GLOSSARY = 'g',
  CHANGE_MICROPHONE = 'm',
  TOGGLE_CLIPBOARD = 'c',
  TOGGLE_WRAP = 'w',
  TOGGLE_GENERAL_GLOSSARY = 'n',
  CHANGE_CHUNK_LENGTH = 'k',
  CYCLE_GLOSSARY_LEARNING = 'a',
  QUIT = 'q',
}

export enum TestStatus {
  IDLE = 'idle',
  RECORDING = 'recording',
  SAVING = 'saving',
  RECORDED = 'recorded',
  PLAYING = 'playing',
}
