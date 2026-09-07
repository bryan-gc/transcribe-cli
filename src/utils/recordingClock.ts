export class RecordingClock {
  private seconds = 0;
  private paused = false;

  tick(): number {
    if (!this.paused) this.seconds += 1;
    return this.seconds;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  get elapsed(): number {
    return this.seconds;
  }

  get isPaused(): boolean {
    return this.paused;
  }
}

export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
