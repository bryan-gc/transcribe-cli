import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import type { SpeakerSummary } from '../speakers/speakerSummary.js';
import type { SpeakerNames } from '../speakers/renameSpeakers.js';

export function SpeakerNaming({
  speakers,
  clips,
  onPlay,
  onDone,
}: {
  speakers: SpeakerSummary[];
  clips: Record<string, string>;
  onPlay: (clip: string) => void;
  onDone: (names: SpeakerNames | undefined) => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [typing, setTyping] = useState(false);
  const [names, setNames] = useState<SpeakerNames>({});
  const current = speakers[cursor]!;

  useInput(
    (input, key) => {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow) setCursor((c) => Math.min(speakers.length - 1, c + 1));
      else if (input === 'p' && clips[current.label]) onPlay(clips[current.label]!);
      else if (key.return) setTyping(true);
      else if (input === 's') onDone(names);
      else if (input === 'q' || key.escape) onDone(undefined);
    },
    { isActive: !typing },
  );

  const width = Math.max(...speakers.map((s) => s.label.length));
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Who is speaking? ({speakers.length} voices)</Text>
      <Text dimColor>
        ↑↓ move · p play a clip · enter type a name (an existing name merges the voices) · s save ·
        q leave the labels
      </Text>
      {speakers.map((speaker, i) => (
        <Text key={speaker.label} color={i === cursor ? 'cyan' : undefined}>
          {i === cursor ? '▸ ' : '  '}
          {speaker.label.padEnd(width + 2)}
          {`${speaker.turns} turns · ${Math.floor(speaker.seconds / 60)}m ${String(speaker.seconds % 60).padStart(2, '0')}s  `}
          <Text dimColor>{`"${speaker.sample}"`}</Text>
          {clips[speaker.label] ? '' : '  (no clean clip)'}
          <Text color="magenta">{names[speaker.label] ? `  → ${names[speaker.label]}` : ''}</Text>
        </Text>
      ))}
      {typing && (
        <Box>
          <Text>Name for {current.label}: </Text>
          <TextInput
            defaultValue={names[current.label] ?? ''}
            onSubmit={(value) => {
              setNames((all) => ({ ...all, [current.label]: value.trim() }));
              setTyping(false);
              setCursor((c) => Math.min(speakers.length - 1, c + 1));
            }}
          />
        </Box>
      )}
    </Box>
  );
}
