import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { type LanguageCode, LANGUAGE_NAMES } from '../constants.js';

interface HeaderProps {
  title: string;
  statusText: string;
  isBusy: boolean;
  activeLanguage: LanguageCode;
  glossaryLabel: string;
  micLabel: string;
  clipboardEnabled: boolean;
  showClipboardHotkey?: boolean;
}

export function Header({
  title,
  statusText,
  isBusy,
  activeLanguage,
  glossaryLabel,
  micLabel,
  clipboardEnabled,
  showClipboardHotkey = false,
}: HeaderProps) {
  return (
    <>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text>
          Status:{' '}
          <Text color="yellow">
            {isBusy && (
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
          Microphone: <Text color="magenta">{micLabel}</Text>
        </Text>
        <Text>
          Clipboard:{' '}
          <Text color={clipboardEnabled ? 'green' : 'red'}>
            {clipboardEnabled ? '✅ On' : '❌ Off'}
          </Text>
          {showClipboardHotkey && <Text dimColor> [c]</Text>}
        </Text>
      </Box>
    </>
  );
}
