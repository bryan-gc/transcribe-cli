import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import Spinner from 'ink-spinner';
import path from 'path';
import fs from 'fs';
import { AudioRecorder } from '../audio/recorder.js';
import { WhisperTranscriber } from '../transcriber/WhisperTranscriber.js';
import { extractTextFromSrt } from '../utils/srtParser.js';
import { copyTextToClipboard } from '../utils/clipboard.js';
import type { AppConfig } from '../config/configManager.js';
import { listMicDevices } from '../audio/micDevices.js';
import { DIR, EXT, Encoding, LANGUAGE_NAMES, TranscriptionFormat, getPaths } from '../constants.js';

function getTimestampPaths(basePath: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const folder = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const base = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const tmpDir = path.resolve(basePath, DIR.TMP, folder);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  return {
    audioPath: path.join(tmpDir, `${base}${EXT.AUDIO}`),
    srtPath: path.join(tmpDir, `${base}${EXT.SUBTITLES}`),
    textPath: path.join(tmpDir, `${base}${EXT.TEXT}`),
  };
}

function readGlossaryContent(basePath: string, filename: string): string | undefined {
  if (!filename) return undefined;
  const filepath = path.join(getPaths(basePath).GLOSSARIES_DIR, filename);
  const content = fs.existsSync(filepath) ? fs.readFileSync(filepath, Encoding.UTF8).trim() : '';
  return content || undefined;
}

// Ensure at least one glossary is selected if available
function getInitialGlossary(basePath: string): string {
  const dir = getPaths(basePath).GLOSSARIES_DIR;
  if (!fs.existsSync(dir)) return '';
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(EXT.GLOSSARY))
    .sort();
  return files[0] ?? '';
}

export function AutoRecordApp({ appConfig }: { appConfig: AppConfig }) {
  const { exit } = useApp();

  const [statusText, setStatusText] = useState('Initializing recording...');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState('');

  const [currentAudioPath, setCurrentAudioPath] = useState('');
  const [currentSrtPath, setCurrentSrtPath] = useState('');
  const [currentTextPath, setCurrentTextPath] = useState('');

  const recorderRef = useRef<AudioRecorder | null>(null);
  const transcriberRef = useRef<WhisperTranscriber | null>(null);

  const activeLanguage = appConfig.selectedLanguage;
  const activeMicId = appConfig.selectedMicrophone;

  // Try to find the mic name
  const mics = listMicDevices();
  const activeMic = mics.find((m) => m.id === activeMicId) ?? {
    id: activeMicId,
    label: activeMicId,
  };

  const activeGlossary = getInitialGlossary(appConfig.basePath);

  useEffect(() => {
    // Component mount: Start recording instantly
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    transcriberRef.current = new WhisperTranscriber(appConfig.apiKey);

    try {
      recorder.setDevice(activeMic.id);
    } catch {
      // Ignore if device fails, recorder will try default
    }

    const p = getTimestampPaths(appConfig.basePath);
    setCurrentAudioPath(p.audioPath);
    setCurrentSrtPath(p.srtPath);
    setCurrentTextPath(p.textPath);

    recorder.start(p.audioPath);
    setIsRecording(true);
    setStatusText('🔴 Recording... Press [Enter] to stop and transcribe.');

    return () => {
      // Cleanup if unmounted unexpectedly
      if (recorderRef.current) {
        recorderRef.current.stop().catch(() => {});
      }
    };
  }, [appConfig]);

  const handleStopAndTranscribe = async () => {
    if (!recorderRef.current || !transcriberRef.current || !isRecording || isTranscribing) {
      return;
    }

    try {
      setIsRecording(false);
      setIsTranscribing(true);
      setStatusText('⏹️  Stopped recording. Saving file...');

      await recorderRef.current.stop();
      recorderRef.current = null; // Prevent multiple stops

      if (!fs.existsSync(currentAudioPath)) {
        setStatusText('❌ Error: Audio file was not generated.');
        setTimeout(exit, 2000);
        return;
      }

      const glossaryPrompt = readGlossaryContent(appConfig.basePath, activeGlossary);

      setStatusText(
        `⏳ Transcribing (${LANGUAGE_NAMES[activeLanguage]}${glossaryPrompt ? ' + glossary' : ''})...`,
      );

      const srtContent = await transcriberRef.current.transcribe(
        currentAudioPath,
        activeLanguage,
        TranscriptionFormat.SRT,
        glossaryPrompt,
        (msg) => setStatusText(`⏳ Transcribing: ${msg}`),
      );

      setStatusText('⏳ Formatting text and saving files...');
      fs.writeFileSync(currentSrtPath, srtContent, Encoding.UTF8);
      const cleanText = extractTextFromSrt(srtContent);
      fs.writeFileSync(currentTextPath, cleanText, Encoding.UTF8);

      setTranscriptionResult(cleanText);

      if (appConfig.autoCopy) {
        copyTextToClipboard(cleanText);
        setStatusText('✅ Transcription done — copied to clipboard.');
      } else {
        setStatusText('✅ Transcription completed and saved.');
      }

      // Exit shortly after showing the final result
      setTimeout(exit, 500);
    } catch (err: unknown) {
      setStatusText(`❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      setIsTranscribing(false);
      setTimeout(exit, 3000);
    }
  };

  useInput(
    (input, key) => {
      if (key.return) {
        handleStopAndTranscribe();
      }
      if (key.ctrl && input === 'c') {
        if (recorderRef.current) recorderRef.current.stop().catch(() => {});
        exit();
      }
    },
    { isActive: isRecording && !isTranscribing },
  );

  const glossaryLabel = activeGlossary ? path.basename(activeGlossary, EXT.GLOSSARY) : '(none)';

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>{'=== transcribe-cli (Auto Record) ==='}</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text>
          Status:{' '}
          <Text color="yellow">
            {(isRecording || isTranscribing) && (
              <Text color="cyan">
                <Spinner type="dots" />{' '}
              </Text>
            )}
            {statusText}
          </Text>
        </Text>
        <Text>
          Language: <Text color="magenta">{LANGUAGE_NAMES[activeLanguage]}</Text>
        </Text>
        <Text>
          Glossary: <Text color="magenta">{glossaryLabel}</Text>
        </Text>
        <Text>
          Microphone: <Text color="magenta">{activeMic.label}</Text>
        </Text>
        <Text>
          Auto Copy to Clipboard:{' '}
          <Text color={appConfig.autoCopy ? 'green' : 'red'}>
            {appConfig.autoCopy ? '✅ On' : '❌ Off'}
          </Text>
        </Text>
      </Box>

      {transcriptionResult !== '' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            Transcription Result:
          </Text>
          <Text>{transcriptionResult}</Text>
          <Text dimColor>📄 {currentTextPath}</Text>
        </Box>
      )}
    </Box>
  );
}
