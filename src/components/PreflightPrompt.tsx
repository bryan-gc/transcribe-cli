import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Engine } from '../config/configManager.js';
import { ActionHotkey, MenuAction } from '../constants.js';
import { formatDuration } from '../utils/runTranscription.js';
import { formatEstimatedCost, formatEstimatedTime, type RunEstimate } from '../utils/estimate.js';

export function PreflightPrompt({
  audioSeconds,
  rows,
  selected,
  onSelect,
  onConfirm,
  onCancel,
}: {
  audioSeconds: number;
  rows: RunEstimate[];
  selected: number;
  onSelect: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useInput((input, key) => {
    if (key.return) onConfirm();
    else if (input.toLowerCase() === MenuAction.CHANGE_ENGINE)
      onSelect((selected + 1) % rows.length);
    else if (input.toLowerCase() === ActionHotkey.CANCEL_Q) onCancel();
  });

  const modelWidth = Math.max(...rows.map((r) => r.model.length));
  const costWidth = Math.max(...rows.map((r) => formatEstimatedCost(r.cost).length));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        {'Audio:'.padEnd(12)}
        <Text color="magenta">{formatDuration(audioSeconds * 1000)}</Text>
      </Text>
      {rows.map((row, index) => (
        <Text key={row.model} color={index === selected ? 'cyan' : undefined}>
          {index === selected ? '› ' : '  '}
          {(row.engine === Engine.LOCAL ? 'Local' : 'OpenAI').padEnd(10)}
          {row.model.padEnd(modelWidth + 2)}
          {formatEstimatedCost(row.cost).padEnd(costWidth + 3)}
          {formatEstimatedTime(row)}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          {`[Enter] transcribe · [${MenuAction.CHANGE_ENGINE}] change engine · [${ActionHotkey.CANCEL_Q}] cancel`}
        </Text>
      </Box>
    </Box>
  );
}
