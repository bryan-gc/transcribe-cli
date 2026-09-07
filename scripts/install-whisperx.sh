#!/usr/bin/env bash
# Installs WhisperX into a dedicated virtualenv for the local transcription engine.
#
# A virtualenv rather than a system-wide install, for two reasons:
#   - Ubuntu's system Python is PEP 668 managed: pip refuses to write to it without
#     --break-system-packages, and overriding that is how a working Python gets broken.
#   - This machine already has torch 2.4.1+cu121 installed globally, which other projects
#     depend on. Installing WhisperX system-wide can move that version underneath them.
#
# Usage:  ./scripts/install-whisperx.sh [venv-path]
# Default venv: ~/.transcribe-cli/venv-whisperx

set -euo pipefail

VENV="${1:-$HOME/.transcribe-cli/venv-whisperx}"
PYTHON_MIN_MINOR=9

info()  { printf '\033[36m→\033[0m %s\n' "$1"; }
ok()    { printf '\033[32m✔\033[0m %s\n' "$1"; }
fail()  { printf '\033[31m✘\033[0m %s\n' "$1" >&2; exit 1; }

command -v python3 >/dev/null || fail "python3 not found. Install it with: sudo apt install python3"
command -v ffmpeg  >/dev/null || fail "ffmpeg not found. Install it with: sudo apt install ffmpeg"

read -r major minor <<<"$(python3 -c 'import sys; print(sys.version_info.major, sys.version_info.minor)')"
[ "$major" -eq 3 ] && [ "$minor" -ge "$PYTHON_MIN_MINOR" ] \
  || fail "Python 3.$PYTHON_MIN_MINOR or newer required, found $major.$minor"

info "Python $major.$minor, ffmpeg $(ffmpeg -version | head -1 | cut -d' ' -f3)"

if [ ! -d "$VENV" ]; then
  info "Creating virtualenv at $VENV"
  python3 -m venv "$VENV" || fail "venv creation failed. Install it with: sudo apt install python3-venv"
else
  info "Reusing virtualenv at $VENV"
fi

info "Installing whisperx (this downloads torch and friends, around 2 GB)"
"$VENV/bin/pip" install --upgrade pip -q
"$VENV/bin/pip" install whisperx

"$VENV/bin/python" -c 'import whisperx' || fail "whisperx installed but does not import"

ok "WhisperX ready at $VENV/bin/whisperx"
echo
echo "Point the CLI at it:"
echo "  transcribe-cli setup            # and choose the local engine"
echo "or set it directly:"
echo "  TRANSCRIBE_PYTHON_PATH=$VENV/bin/python"
echo
echo "Speaker diarization is a separate concern: it needs the gated pyannote models"
echo "and a HuggingFace token, and is not wired up yet. Local transcription works"
echo "without any of that."
