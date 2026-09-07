# transcribe-cli

A terminal (CLI) application built with Node.js and TypeScript that records audio from your microphone and transcribes it using the OpenAI Whisper API.

## System Requirements

This tool depends on native audio utilities. Install them before running:

### Linux (Ubuntu / Debian)
```bash
sudo apt-get update
sudo apt-get install sox libsox-fmt-all
```

### macOS
```bash
brew install sox
```

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

- **Recording:** Starts immediately upon launch.
- **Stop & Transcribe:** Simply press `Enter`. The tool will stop recording, run the transcription, copy it to your clipboard (if enabled in your config), and exit automatically.

### 2. Manual Menu Mode

If you prefer the interactive terminal menu to change settings (Microphone, Language, Glossary, etc.) on the fly before recording, use the `--manual` flag:

```bash
transcribe-cli --manual
# or
transcribe-cli -m
```

Navigate the interactive menu with:
- **Arrow keys** — move up/down
- **Enter** — confirm selection
- **Hotkeys** — press the letter shown in brackets (e.g., `r` to record, `t` to transcribe, `q` to quit)

### CLI Options

| Option | What it does |
|---|---|
| `-m, --manual` | Open the interactive menu instead of recording straight away |
| `-l, --language <code>` | Language of the audio: `es`, `en`, `pt`, `fr`, `de` |
| `-g, --glossary <name>` | Glossary to use as context, with or without the `.txt` |
| `--no-copy` | Do not copy the result to the clipboard on this run |
| `-v, --version` | Output the current version |
| `-h, --help` | Display help |

```bash
transcribe-cli -l es                    # record and transcribe in Spanish
transcribe-cli -l en -g devops          # English, with the devops glossary as context
transcribe-cli --no-copy                # leave the clipboard alone this time
```

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
npm run start -- --manual
npm run start -- -m

# View Help
npm run start -- --help

# View Version
npm run start -- --version
```
