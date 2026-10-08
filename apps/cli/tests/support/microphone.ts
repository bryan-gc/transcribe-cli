import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { makeTone } from './audio.js';
import type { Sandbox } from './sandbox.js';

export interface MicOptions {
  pipewire?: { id: string; label: string }[];
  alsa?: string;
  audio?: 'tone' | 'header-only';
}

export function fakeMicrophone(sandbox: Sandbox, options: MicOptions = {}) {
  const tone = makeTone(sandbox.file('mic.wav'), 3);
  const header = sandbox.write('header.wav', fs.readFileSync(tone).subarray(0, 44));
  const alsaList = sandbox.write('alsa.txt', options.alsa ?? '');
  sandbox.stub(
    'arecord',
    [
      `if [ "$1" = "-L" ]; then cat '${alsaList}'; exit 0; fi`,
      `printf '%s\\n' "$@" > '${sandbox.logDir}/arecord.args'`,
      `printf 'PULSE_SOURCE=%s\\n' "$PULSE_SOURCE" >> '${sandbox.logDir}/arecord.args'`,
      `echo $$ > '${sandbox.logDir}/arecord.pid'`,
      `cat '${options.audio === 'header-only' ? header : tone}'`,
      "trap 'exit 0' INT TERM",
      'while true; do sleep 0.1; done',
    ].join('\n'),
  );
  if (options.pipewire) {
    const nodes = [
      {
        id: 30,
        info: {
          props: {
            'media.class': 'Audio/Sink',
            'node.name': 'alsa_output.speakers',
            'node.description': 'Speakers',
          },
        },
      },
      ...options.pipewire.map((mic, index) => ({
        id: 40 + index,
        info: {
          props: {
            'media.class': 'Audio/Source',
            'node.name': mic.id,
            'node.description': mic.label,
          },
        },
      })),
    ];
    const dump = sandbox.write('pw-dump.json', JSON.stringify(nodes));
    sandbox.stub('pw-dump', `cat '${dump}'`);
  }
  return { tone };
}

export function processState(sandbox: Sandbox): string {
  const pid = sandbox.read(`${sandbox.logDir}/arecord.pid`).trim();
  return execFileSync('ps', ['-o', 'stat=', '-p', pid], { encoding: 'utf8' }).trim();
}
