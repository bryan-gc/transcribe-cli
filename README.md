# transcribe-cli

A terminal (CLI) application built with Node.js and TypeScript that records audio from your microphone and transcribes it using the OpenAI Whisper API.

## System Requirements

This tool depends on native audio utilities. Install them before running:

### Linux (Ubuntu / Debian)
```bash
sudo apt-get update
sudo apt-get install sox libsox-fmt-all
```

Run `transcribe-cli doctor` at any point to see what is present and what is missing.

### macOS
```bash
brew install sox
```

`ffmpeg` is only needed to import audio files that are not already in a format the API accepts
(`sudo apt install ffmpeg`, or `brew install ffmpeg`).

### Windows
1. Download the binaries from [SoX](https://sourceforge.net/projects/sox/).
2. Add the SoX folder to your `PATH` environment variable.

---

## Installation

```bash
npm install -g @bryan-gc/transcribe-cli
```

## First Run & Configuration

On the first launch, an interactive prompt will ask you for:
- Your **OpenAI API Key**
- A **base path** where audio recordings and glossaries will be stored

Your settings are saved persistently at `~/.transcribe-cli/config.json` and reused on every subsequent run.

## Usage

The application features two main modes of operation: **Auto Record Mode** (default) and **Manual Menu Mode**.

### 1. Auto Record Mode (Default)

Optimized for quick usage. By default, launching the app instantly starts recording your audio using your saved configuration.

```bash
# Start recording instantly
transcribe-cli
```

- **Recording:** Starts immediately upon launch. The status line shows the recorded time, what the
  audio would cost through the API so far, and how long it would take to transcribe locally.
- **Pause:** Press `space` to pause and again to resume. The clock counts recorded audio, not the
  time you spent paused.
- **Stop & Transcribe:** Simply press `Enter`. The tool will stop recording, run the transcription, copy it to your clipboard (if enabled in your config), and exit automatically.

### 2. Manual Menu Mode

If you prefer the interactive terminal menu to change settings (Microphone, Language, Glossary, etc.) on the fly before recording, use the `--config` flag:

```bash
transcribe-cli --config
# or
transcribe-cli -c
```

Navigate the interactive menu with:
- **Arrow keys** — move up/down
- **Enter** — confirm selection
- **Hotkeys** — press the letter shown in brackets (e.g., `r` to record, `t` to transcribe, `q` to quit)

### 3. Transcribing a File You Already Have

Point the tool at an audio file instead of recording one:

```bash
transcribe-cli -f ~/Downloads/AUD-20260906-WA0012.opus
transcribe-cli --file "meeting.m4a" -l en
```

A copy of the audio is kept in `transcriptions/imported/`, with the transcription beside it, the
same way recordings are stored. Your original file is not touched.

`mp3`, `mp4`, `m4a`, `wav`, `webm`, `flac`, `ogg`, `mpeg` and `mpga` are sent as they are. Anything
else, and anything over 25 MB, is converted first, which needs `ffmpeg` installed.

A file of five minutes or more stops on a short table first: the estimated cost and time with each
engine, so a two-hour meeting is not sent to the API by accident. `Enter` transcribes, `e` switches
engine, `q` cancels. Pass `--yes` to skip it in scripts. Times start as a rough guess and improve as
the tool learns how fast this machine and your connection actually are.

---

### Checking What Is Installed

```bash
transcribe-cli doctor          # what this setup needs
transcribe-cli doctor --all    # everything, including what you are not using
```

Each tool is listed under what needs it, so a missing `ffmpeg` does not look like a problem if you
never import files. The exit code counts only what your setup actually uses, which makes it safe in
a script.

If something is installed but not on your `PATH`, point at it directly:

```bash
TRANSCRIBE_FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg transcribe-cli -f nota.mp3
```

---

### CLI Options

| Option | What it does |
|---|---|
| `-c, --config` | Open the configuration menu instead of recording straight away |
| `-f, --file <path>` | Transcribe an existing audio file instead of recording |
| `-s, --speakers` | Label who is speaking, for recordings with more than one voice |
| `--local` | Transcribe on this machine with WhisperX instead of the API |
| `--engine <name>` | `openai` or `local`, the long form of `--local` |
| `-l, --language <code>` | Language of the audio: `es`, `en`, `pt`, `fr`, `de` |
| `-g, --glossary <name>` | Glossary to use as context, with or without the `.txt` |
| `--no-copy` | Do not copy the result to the clipboard on this run |
| `-y, --yes` | Skip the cost confirmation shown for long audio files (`TRANSCRIBE_YES=1` does the same) |
| `-v, --version` | Output the current version |
| `-h, --help` | Display help |

```bash
transcribe-cli -l es                    # record and transcribe in Spanish
transcribe-cli -l en -g devops          # English, with the devops glossary as context
transcribe-cli --no-copy                # leave the clipboard alone this time
```

### Speaker Labels

For a meeting or an interview, `--speakers` attributes each turn to a voice:

```bash
transcribe-cli -f meeting.m4a --speakers
```

```
[Speaker A] Did you look at the billing report?
[Speaker B] Yes, I uploaded it yesterday.
```

The subtitles keep the same labels, with their timings. This uses a different, slower and dearer
model than a plain transcription, so it is off unless you ask for it. A recording with a single
voice is never labelled.

### Transcribing Locally

With WhisperX installed, transcription runs on your own machine: no network, no cost per minute.

```bash
./scripts/install-whisperx.sh      # a virtualenv of its own, no root needed
transcribe-cli --local
```

The installer does not touch your system Python or any packages other projects depend on. Set
`engine` to `local` in `~/.transcribe-cli/config.json` to make it the default, in which case no API
key is needed at all.

Speaker labels are not available locally yet; `--local --speakers` says so rather than quietly
dropping them.

Options are also read from the environment, which is handy in a shell alias:
`TRANSCRIBE_LANGUAGE`, `TRANSCRIBE_GLOSSARY`, `TRANSCRIBE_COPY`.

Where the same option is set in more than one place, the most specific one wins:

```
command line  >  environment  >  ~/.transcribe-cli/config.json  >  built-in default
```

A flag applies to that run only. Nothing on the command line changes the saved configuration —
that is what the interactive menu is for.

---

## Development Usage

If you are developing the tool locally and running it via `npm run start`, you must use a double dash (`--`) to pass arguments to the script instead of `npm` itself:

```bash
# Auto Record Mode (Default)
npm run start

# Manual Menu Mode
npm run start -- --config
npm run start -- -c

# View Help
npm run start -- --help

# View Version
npm run start -- --version
```
