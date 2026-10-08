import { spawnSync } from 'child_process';
import { Cmd, Encoding } from '../constants.js';
import { resolveBinary } from '../system/dependencies.js';

export function audioDurationSeconds(filePath: string): number | undefined {
  const ffprobe = resolveBinary(Cmd.FFPROBE);
  if (ffprobe === null) return undefined;

  const result = spawnSync(
    ffprobe,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
    { encoding: Encoding.UTF8 },
  );
  if (result.status !== 0) return undefined;

  const seconds = Number.parseFloat((result.stdout ?? '').trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
