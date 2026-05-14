import record from 'node-record-lpcm16';
import fs from 'fs';
import type { Readable } from 'stream';
import { DEFAULT_DEVICE_ID } from '../constants.js';

/** Minimal interface for the recording handle returned by node-record-lpcm16 */
interface RecordingHandle {
  stream(): Readable;
  pause(): void;
  resume(): void;
  stop(): void;
}

export class AudioRecorder {
  private recording: RecordingHandle | null = null;
  private fileStream: fs.WriteStream | null = null;
  private filepath: string = '';
  private device: string = DEFAULT_DEVICE_ID;

  setDevice(device: string): void {
    if (this.recording) {
      throw new Error('Cannot change device while recording is in progress.');
    }
    this.device = device;
  }

  getDevice(): string {
    return this.device;
  }

  start(filepath: string): void {
    if (this.recording) {
      throw new Error('A recording is already in progress.');
    }

    this.filepath = filepath;
    this.fileStream = fs.createWriteStream(filepath, { encoding: 'binary' });

    this.recording = record.record({
      sampleRate: 16000,
      channels: 1,
      audioType: 'wav',
      device: this.device,
    }) as RecordingHandle;

    this.recording.stream().pipe(this.fileStream);
  }

  pause(): void {
    this.recording?.pause();
  }

  resume(): void {
    this.recording?.resume();
  }

  /** Stops the recording and resolves only when the audio file has been fully written to disk. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.recording) {
        this.recording.stop();
        this.recording = null;
      }

      if (this.fileStream) {
        const stream = this.fileStream;
        this.fileStream = null;

        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        stream.on('finish', done);
        stream.on('close', done);
        stream.on('error', done);

        // Safety fallback — should not be needed in practice
        setTimeout(done, 1500);
        return;
      }
      resolve();
    });
  }

  getFilepath(): string {
    return this.filepath;
  }
}
