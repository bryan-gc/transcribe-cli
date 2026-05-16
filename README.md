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

```bash
transcribe-cli
```

Navigate the interactive menu with:
- **Arrow keys** — move up/down
- **Enter** — confirm selection
- **Hotkeys** — press the letter shown in brackets (e.g. `r` to record, `t` to transcribe, `q` to quit)
