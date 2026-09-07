import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { MicDevice } from '../audio/micDevices.js';
import { ActionHotkey } from '../constants.js';

interface PriorityPickerProps {
  title: string;
  devices: MicDevice[];
  /** Device ids already in the list, most preferred first. */
  priority: string[];
  onConfirm: (priority: string[]) => void;
  onTest: (device: MicDevice) => void;
  onCancel: () => void;
}

/**
 * Builds an ordered list of preferred microphones.
 *
 * Kept apart from Picker, which exists to choose exactly one thing. Ordering needs a cursor, a
 * selection and a way to move rows, and folding all of that into Picker would leave it with three
 * modes and no clear one.
 */
export function PriorityPicker({
  title,
  devices,
  priority,
  onConfirm,
  onTest,
  onCancel,
}: PriorityPickerProps) {
  // Chosen devices first, in their saved order, then the rest: the list reads as the ranking it is.
  const ordered = [
    ...priority.filter((id) => devices.some((d) => d.id === id)),
    ...devices.filter((d) => !priority.includes(d.id)).map((d) => d.id),
  ];
  const [rows, setRows] = useState<string[]>(ordered);
  const [chosen, setChosen] = useState<string[]>(priority.filter((id) => ordered.includes(id)));
  const [cursor, setCursor] = useState(0);

  const labelOf = (id: string) => devices.find((d) => d.id === id)?.label ?? id;
  const move = (offset: number) => {
    const to = cursor + offset;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[cursor], next[to]] = [next[to]!, next[cursor]!];
    setRows(next);
    setCursor(to);
  };

  useInput((input, key) => {
    if (key.escape) return onCancel();
    if (key.upArrow) return setCursor((i) => (i > 0 ? i - 1 : rows.length - 1));
    if (key.downArrow) return setCursor((i) => (i < rows.length - 1 ? i + 1 : 0));
    if (key.return) {
      // Confirming keeps the ranking implied by the rows, not the order things were ticked in.
      return onConfirm(rows.filter((id) => chosen.includes(id)));
    }
    if (input === ' ') {
      const id = rows[cursor]!;
      return setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    }
    if (input === '+' || input === 'K') return move(-1);
    if (input === '-' || input === 'J') return move(1);
    if (input.toLowerCase() === ActionHotkey.STOP) {
      const device = devices.find((d) => d.id === rows[cursor]);
      if (device) onTest(device);
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        --- {title} ---
      </Text>
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        {rows.map((id, index) => {
          const rank = rows.filter((r) => chosen.includes(r)).indexOf(id);
          return (
            <Text key={id} color={index === cursor ? 'cyan' : undefined}>
              {index === cursor ? '> ' : '  '}
              {rank >= 0 ? `${rank + 1}. ` : '   '}
              {labelOf(id)}
            </Text>
          );
        })}
        {rows.length === 0 && <Text dimColor>No microphones detected.</Text>}
      </Box>
      <Text dimColor>
        ↑↓ move cursor · Space pick · +/- reorder · s test · Enter save · Esc cancel
      </Text>
      <Text dimColor>The first one connected is the one that records.</Text>
    </Box>
  );
}
