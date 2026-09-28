# transcribe-cli

A terminal application that records a voice note and gives you back the text, in the same breath.
Built with Node.js and TypeScript. It transcribes through the OpenAI API or entirely on your own
machine with WhisperX — your choice, per run or as a default.

**What it does**

- **Record and transcribe in one step.** Launch it, talk, press `Enter`. The text lands on your
  clipboard and on disk.
- **Pause while recording** with `space`, and the clock only counts audio, not the pause.
- **Transcribe files you already have** with `-f`: voice notes, meeting recordings, anything
  `ffmpeg` can read.
- **Two engines.** The OpenAI API, or **WhisperX locally** — no network, no cost per minute.
- **Speaker labels** with `-s`, for a meeting or an interview.
- **Glossaries** (`-g`) so names, acronyms and jargon come out spelled right.
- **A microphone priority list**, so it falls back on its own when your usual mic is unplugged.
- **The cost before you spend it**, live while you record, and a `.meta.json` with what each run
  actually cost afterwards.
- **`transcribe-cli usage`** to add it all up by day and by engine.
- **`transcribe-cli doctor`** to tell you what is missing, per capability, with the exact command
  to install it.
- **Retry without losing the audio** if a transcription fails, picking the engine, and
  and `transcribe-cli list` to transcribe any past one again and keep every attempt.
- **Five languages**: `es`, `en`, `pt`, `fr`, `de`.

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

Your settings are saved persistently at `~/.transcribe-cli/config.json` (readable only by you) and
reused on every subsequent run. Everything else — engine, language, microphone order, glossary,
clipboard — is changed later from the menu:

```bash
transcribe-cli -c
```

The API key is only asked for because the OpenAI engine is the default. Switch the engine to local
and no key is needed at all.

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

### What Everything Cost

Every transcription leaves a `.meta.json` next to its text with the engine, the model, how long it
took and what it cost, and appends the same line to `usage.jsonl` in your data folder.

```bash
transcribe-cli usage          # by day and by engine, with the total
transcribe-cli usage --all    # plus one line per transcription
```

---

### Microphone Priority

Instead of one fixed microphone, you keep an ordered list. The tool records with the first one that
is actually connected, so unplugging your usual mic does not mean editing any configuration:

```bash
transcribe-cli -c        # Microphone → set the order
```

The status line names the microphone it ended up using, and says so when that was not your first
choice.

### Where Your Files Go

Everything lives under the base path you chose on first run (`~/transcribe_cli_data` by default):

```
transcriptions/
  recorded/2026-09-07/15-01-07.wav        the audio, the .srt, the .txt and the .meta.json
  imported/2026-09-07/15-14-10__nota.txt  files brought in with -f, prefixed with when you ran it
  …/15-01-07.attempts.json                earlier attempts, once it was transcribed again
glossaries/                               one .txt per glossary
usage.jsonl                               one line per transcription
```

Recordings are never deleted: the audio stays next to its transcript, grouped by day. Earlier
versions kept everything in a `tmp/` folder; if you have one, the first run after updating moves it
into `transcriptions/recorded/` on its own, without touching a file it would have to overwrite.

#### Recorded or imported

Each transcription says how the tool was used to get it, in the `source` field of its `.meta.json`
and of its line in `usage.jsonl`, and by the folder it sits in:

- `recorded`: captured from the microphone by `transcribe-cli` itself. It is what the microphone
  heard, not only your voice: anyone speaking nearby is in it too.
- `imported`: an audio file passed with `-f`, whoever is speaking in it. That includes your own
  voice notes, and a recording of this tool transcribed again with `-f`.

`-a, --aside` adds `"aside": true` to that same meta and log line, for a run you want to tell apart
later: a meeting, a class, a video playing. It is saved, copied and counted like any other run, in
the same folder, and works with `-f` too.

The field exists since 1.1.0 (2026-09-07). Transcripts from before that had no `.meta.json`. When
the app finds any, whatever command you run, it asks once whether to add one: with the date taken
from the folder and the file name, the source taken from the folder, the audio file and its length,
and `"backfilled": true`. Nothing else is written, and existing files are never changed. Answer
`never` to stop the question; `askMetaBackfill: true` in the config brings it back. Engine, model
and cost are left out because they are not known, so these runs do not count in `usage`.

### What Gets Copied

Copied transcripts are wrapped in a short notice, in the language of the audio, so whoever you paste
them to — a person or an assistant — knows the text is unreviewed speech to text:

```text
[AUTOMATIC TRANSCRIPTION — speech to text, unreviewed. It may contain wrong words, misspelled names or cut-off sentences; read with judgement.]

…the transcript…

[END OF TRANSCRIPTION]
[Glossary used as a spelling reference: Kubernetes, Terraform]
```

Speaker-labelled runs add a line saying the labels may be wrong, and audio over ten minutes adds its
length. The saved `.txt` is never wrapped. The notice is on by default: turn it off for one run with
`--no-wrap` or `TRANSCRIBE_WRAP=0`, or for good with **Copy notice** in `transcribe-cli -c`
(key `w`).

### Glossaries

A glossary is a plain `.txt` in `glossaries/`: one term, name or short phrase per line, or a
comma-separated list. Lines starting with `#` are ignored.

Only about 220 tokens of it are sent — that is what the engines keep. When a glossary is longer,
its **top** lines are dropped first, so keep the most important terms at the bottom. The status
panel says when that happens (`trimmed: kept the last 9 of 25 lines`).

| Engine | How the glossary is used |
|---|---|
| OpenAI API | Sent as the transcription prompt |
| Local (WhisperX) | Sent as `--hotwords` |
| `--speakers` | Not used: the speaker-labelling model does not accept a prompt |

A line with `=>` is a **replacement** instead of a term: it is never sent, and after
transcribing it fixes that phrase in the text, the subtitles and the speaker transcript, as a
whole word and ignoring case. It is the way to correct a name the engine keeps getting wrong, and
the only glossary help `--speakers` gets.

```text
Cloud Run
cloud ran => Cloud Run
big query => BigQuery
```

The `.meta.json` of each transcription records which glossary was used, never its content.

#### Glossaries that fill themselves

Nobody writes glossaries by hand, so they are learned from your own transcripts, with no model
involved: words said in most notes are ordinary vocabulary, and what is left gets proposed when
it is capitalised mid-sentence, has a technical shape (`gpt-4o`, `DynamoDB`), or comes as a
repeated pair (`Cloud Run`).

- After every transcription, terms used in at least three recent notes are added to an
  **automatic block** at the bottom of `general.txt`. Delete a line there and that term is never
  added again. What you write above the block is never touched.
- Suggestions for the topic in use are kept for review:

```bash
transcribe-cli glossary suggest [name]  # list what would be proposed
transcribe-cli glossary review [name]   # a add · g add to general · x reject · e fix the spelling
```

Fixing a spelling in review adds the right form and a replacement for the wrong one.
**Glossary learning** in `transcribe-cli -c` (key `a`) switches between *auto*, *suggest only*
and *off*.

There are two kinds: `general.txt`, used on every run, and **topic** glossaries you add with
`-g <name>`. The topic goes last, so when both do not fit it is the general one that loses lines.
`-g none` sends no glossary at all; `--no-general-glossary` leaves the general one out.

```bash
transcribe-cli glossary                 # every glossary, its size, and whether it gets trimmed
transcribe-cli glossary new devops      # create one and open it in your editor
transcribe-cli glossary edit [name]     # open it ($VISUAL, $EDITOR, nano or vi); general by default
transcribe-cli glossary show [name]     # exactly what the engine would receive
```

### Long Audio

Recordings and files of any length work. Anything over 22.5 MB is compressed to a 32 kbps mp3
before upload, and audio longer than ten minutes is sent in pieces cut at a pause, never longer
than ten minutes each. Every piece gets the end of the previous one as context, a piece that fails
is retried on its own, and a retry after a failure only sends the pieces that are still missing.
The subtitles come back as one file with the right times.

With `--speakers`, labels are only consistent inside a piece, so long audio shows them as `1·A`,
`2·A`… Pick a shorter piece length under **Long audio pieces** in `transcribe-cli -c`. The local
engine does not split anything: WhisperX already handles long files.

### Naming the Speakers

`--speakers` labels voices `A`, `B`… With `--name-speakers` on an imported file, a screen lists
each voice once the transcript is ready, with how long it talks and a sample line; `p` plays a
short clip of that voice, `enter` gives it a name, and giving two labels the same name merges them.

In long audio, clean clips of the four voices that talk most in the first piece are sent with
every later piece, so those voices keep one label throughout. Anyone the model does not match
gets the number of the piece they appear in (`3·A`), ready to be named or merged.

Names can be changed later without calling the API again:

```bash
transcribe-cli speakers path/to/transcript.txt              # list the voices, or name them interactively
transcribe-cli speakers path/to/transcript.txt A=Ana B=Luis # rename directly
```

### When a Transcription Fails

The audio is written to disk before anything is sent, so a failure never costs you the recording.
The tool stays open and lists the engines with what each would cost and take, your default one
selected: `[Enter]` tries again with it, `[e]` moves to the next, `[q]` quits.

### Past Transcriptions and Their Attempts

When a transcription comes back wrong — words that were never said, another alphabet, a sentence
repeated — open the history and transcribe it again on the same audio:

```bash
transcribe-cli list        # or: transcribe-cli ls
```

Every recording and import is listed, newest first, with its length and the start of its text.
`[Enter]` opens one and shows all its attempts, the first one at the top and the saved one last:

- `[c]` copies the selected attempt, with the automatic-transcription notice like any other copy.
- `[r]` transcribes it again: pick the engine from the list, your default one selected. The new
  text becomes the saved one, and the one it replaces stays as an earlier attempt.
- `[Esc]` goes back to the list, `[q]` quits.

Transcribing again replaces the `.txt`, `.srt` and `.meta.json` next to the audio, and earlier
attempts go to a `.attempts.json` beside them, so any tool reading the `.txt` files still sees one
text per recording. It keeps the transcription recorded or imported, and aside if it was.
Recordings that never got a transcript are listed too, ready to be transcribed. Flags such as
`--local`, `-s` or `-g` set the default choice.

### CLI Options

| Option | What it does |
|---|---|
| `-c, --config` | Open the configuration menu instead of recording straight away |
| `-f, --file <path>` | Transcribe an existing audio file instead of recording |
| `-s, --speakers` | Label who is speaking, for recordings with more than one voice |
| `-a, --aside` | Save as usual, marked `"aside"` in the meta and in `usage.jsonl` |
| `--local` | Transcribe on this machine with WhisperX instead of the API |
| `--engine <name>` | `openai` or `local`, the long form of `--local` |
| `-l, --language <code>` | Language of the audio: `es`, `en`, `pt`, `fr`, `de` |
| `-g, --glossary <name>` | Glossary to use as context, with or without the `.txt` |
| `--no-wrap` | Copy the bare text, without the automatic-transcription notice |
| `--name-speakers` | With `-f`: label speakers, then name each voice after listening to it |
| `--no-general-glossary` | Leave the general glossary out of this run |
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

The virtualenv goes to `~/.transcribe-cli/venv-whisperx`; pass a path to put it somewhere else:
`./scripts/install-whisperx.sh ~/venvs/whisperx`.

Speaker labels are not available locally yet; `--local --speakers` says so rather than quietly
dropping them.

Options are also read from the environment, which is handy in a shell alias:
`TRANSCRIBE_LANGUAGE`, `TRANSCRIBE_GLOSSARY`, `TRANSCRIBE_COPY`, `TRANSCRIBE_WRAP`.

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
