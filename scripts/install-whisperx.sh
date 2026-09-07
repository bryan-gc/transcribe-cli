#!/usr/bin/env bash
# Installs WhisperX into a dedicated virtualenv for the local transcription engine.
#
# A virtualenv rather than a system-wide install, for two reasons:
#   - Ubuntu's system Python is PEP 668 managed: pip refuses to write to it without
#     --break-system-packages, and overriding that is how a working Python gets broken.
#   - This machine already has a CUDA torch build installed globally that other projects
#     depend on. Installing WhisperX system-wide can move that version underneath them.
#
# Usage:  ./scripts/install-whisperx.sh [venv-path]
# Default venv: ~/.transcribe-cli/venv-whisperx

set -euo pipefail

VENV="${1:-$HOME/.transcribe-cli/venv-whisperx}"
PYTHON_MIN_MINOR=9

info() { printf '\033[36m→\033[0m %s\n' "$1"; }
warn() { printf '\033[33m!\033[0m %s\n' "$1"; }
ok()   { printf '\033[32m✔\033[0m %s\n' "$1"; }
fail() { printf '\033[31m✘\033[0m %s\n' "$1" >&2; exit 1; }

command -v python3 >/dev/null || fail "python3 not found. Install it with: sudo apt install python3"
command -v ffmpeg  >/dev/null || fail "ffmpeg not found. Install it with: sudo apt install ffmpeg"

read -r major minor <<<"$(python3 -c 'import sys; print(sys.version_info.major, sys.version_info.minor)')"
[ "$major" -eq 3 ] && [ "$minor" -ge "$PYTHON_MIN_MINOR" ] \
  || fail "Python 3.$PYTHON_MIN_MINOR or newer required, found $major.$minor"

info "Python $major.$minor, ffmpeg $(ffmpeg -version | head -1 | cut -d' ' -f3)"

# A venv is only usable if it has its own pip. A directory left behind by an interrupted or
# failed run looks like a venv but has no pip, and reusing it fails much later with a confusing
# error, so treat anything without pip as absent.
if [ -x "$VENV/bin/pip" ]; then
  info "Reusing virtualenv at $VENV"
else
  [ -d "$VENV" ] && { warn "Discarding incomplete virtualenv at $VENV"; rm -rf "$VENV"; }
  info "Creating virtualenv at $VENV"

  if python3 -c 'import ensurepip' 2>/dev/null; then
    python3 -m venv "$VENV"
  elif command -v uv >/dev/null; then
    info "No ensurepip, but uv is available"
    uv venv "$VENV"
  elif command -v virtualenv >/dev/null; then
    info "No ensurepip, but virtualenv is available"
    virtualenv --quiet "$VENV"
  else
    # Debian and Ubuntu ship the standard library without ensurepip: it lives in a separate
    # package. There is no way around that from inside this script, and installing packages on
    # someone's behalf is not this script's job, so say exactly what to run and stop.
    cat >&2 <<MSG

This Python cannot create virtualenvs: it has no ensurepip, which Debian and Ubuntu
ship in a separate package. Pick one and run this script again.

  1. Install the missing package (one command, the supported fix):

       sudo apt install python3.${minor}-venv

  2. Without root, if you would rather not touch system packages, install uv, a single
     static binary that creates virtualenvs on its own:

       curl -LsSf https://astral.sh/uv/install.sh | sh

  3. Without root, using pip's own escape hatch. This writes only to ~/.local and cannot
     damage the system Python, despite how the flag reads:

       python3 -m pip install --user --break-system-packages virtualenv

MSG
    fail "No way to create a virtualenv. See the options above."
  fi
fi

[ -x "$VENV/bin/pip" ] || fail "Virtualenv at $VENV has no pip. Remove it and run this again."

info "Installing whisperx (this pulls torch and CUDA wheels: expect around 7 GB on disk)"
"$VENV/bin/pip" install --quiet --upgrade pip
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
