import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import type { Candidate } from '../glossary/extractTerms.js';
import { ReviewAction, type ReviewDecision } from '../glossary/applyReview.js';

const MARKS: Record<ReviewAction, string> = {
  [ReviewAction.ADD]: '[+]',
  [ReviewAction.GENERAL]: '[G]',
  [ReviewAction.REJECT]: '[x]',
  [ReviewAction.SKIP]: '[ ]',
};

const KEYS: Record<string, ReviewAction> = {
  a: ReviewAction.ADD,
  g: ReviewAction.GENERAL,
  x: ReviewAction.REJECT,
  s: ReviewAction.SKIP,
};

export function GlossaryReview({
  name,
  candidates,
  onSave,
}: {
  name: string;
  candidates: Candidate[];
  onSave: (decisions: ReviewDecision[]) => void;
}) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [decisions, setDecisions] = useState<ReviewDecision[]>(
    candidates.map((c) => ({ term: c.term, action: ReviewAction.SKIP })),
  );

  const update = (change: Partial<ReviewDecision>) =>
    setDecisions((all) => all.map((d, i) => (i === cursor ? { ...d, ...change } : d)));

  useInput(
    (input, key) => {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow) setCursor((c) => Math.min(candidates.length - 1, c + 1));
      else if (KEYS[input]) {
        update({ action: KEYS[input] });
        setCursor((c) => Math.min(candidates.length - 1, c + 1));
      } else if (input === 'e') setEditing(true);
      else if (key.return) {
        onSave(decisions);
        exit();
      } else if (input === 'q' || key.escape) exit();
    },
    { isActive: !editing },
  );

  const width = Math.max(...candidates.map((c) => c.term.length));
  return (
    <Box flexDirection="column">
      <Text bold>
        Suggested terms for {name} ({candidates.length})
      </Text>
      <Text dimColor>
        ↑↓ move · a add · g add to general · x reject for good · s skip · e fix spelling, then add ·
        enter save · q quit without saving
      </Text>
      <Text> </Text>
      {candidates.map((c, i) => {
        const decision = decisions[i]!;
        const shown = decision.corrected ? `${c.term} → ${decision.corrected}` : c.term;
        return (
          <Text key={c.key} color={i === cursor ? 'cyan' : undefined}>
            {i === cursor ? '▸ ' : '  '}
            {MARKS[decision.action]} {shown.padEnd(width + 2)}
            <Text dimColor>{`${c.count}× in ${c.docs} notes  "${c.example}"`}</Text>
          </Text>
        );
      })}
      {editing && (
        <Box marginTop={1}>
          <Text>Correct spelling for {decisions[cursor]!.term}: </Text>
          <TextInput
            defaultValue={decisions[cursor]!.corrected ?? decisions[cursor]!.term}
            onSubmit={(value) => {
              update({ corrected: value, action: ReviewAction.ADD });
              setEditing(false);
            }}
          />
        </Box>
      )}
    </Box>
  );
}
