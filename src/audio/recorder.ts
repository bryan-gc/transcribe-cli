import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import {
  DEFAULT_DEVICE_ID,
  Platform,
  Cmd,
  Signal,
  AUDIO_CONFIG,
  ALSA_PREFIXES,
  Encoding,
  StdioOption,
  StreamEvent,
  ProcessEvent,
} from '../constants.js';

export class AudioRecorder {
  private cp: ChildProcess | null = null;
  private fileStream: fs.WriteStream | null = null;
  private filepath: string = '';
  private device: string = DEFAULT_DEVICE_ID;
  private _isPaused: boolean = false;

  setDevice(device: string): void {
    if (this.cp) {
      throw new Error('Cannot change device while recording is in progress.');
    }
    this.device = device;
  }

  getDevice(): string {
    return this.device;
  }

  start(filepath: string): void {
    if (this.cp) {
      throw new Error('A recording is already in progress.');
    }

    this.filepath = filepath;
    this.fileStream = fs.createWriteStream(filepath, { encoding: Encoding.BINARY });
    this._isPaused = false;

    let env = process.env;

    if (os.platform() === Platform.DARWIN) {
      const args = [
        '-d',
        '-q',
        '-r',
        AUDIO_CONFIG.SAMPLE_RATE,
        '-c',
        AUDIO_CONFIG.CHANNELS,
        '-e',
        AUDIO_CONFIG.ENCODING_SOX,
        '-b',
        AUDIO_CONFIG.BITS,
        '-t',
        AUDIO_CONFIG.TYPE,
        '-',
      ];
      if (this.device !== DEFAULT_DEVICE_ID) {
        env = { ...process.env, AUDIODEV: this.device };
      }
      this.cp = spawn(Cmd.SOX, args, {
        stdio: [StdioOption.IGNORE, StdioOption.PIPE, StdioOption.IGNORE],
        env,
      });
      this.cp.stdout?.pipe(this.fileStream);
      return;
    }

    // Linux (arecord)
    const args = [
      '-q',
      '-f',
      AUDIO_CONFIG.FORMAT_ARECORD,
      '-c',
      AUDIO_CONFIG.CHANNELS,
      '-r',
      AUDIO_CONFIG.SAMPLE_RATE,
      '-t',
      AUDIO_CONFIG.TYPE,
    ];

    if (this.device !== DEFAULT_DEVICE_ID) {
      // If the device ID is from PipeWire/PulseAudio (e.g. alsa_input.usb-...)
      // we use the 'pulse' ALSA device and tell Pulse/PipeWire which source to use.
      const isPulse =
        this.device.startsWith(ALSA_PREFIXES.ALSA_INPUT) ||
        this.device.startsWith(ALSA_PREFIXES.BLUEZ_INPUT);
      args.push('-D', isPulse ? AUDIO_CONFIG.DEVICE_PULSE : this.device);
      if (isPulse) env = { ...process.env, PULSE_SOURCE: this.device };
    }

    this.cp = spawn(Cmd.ARECORD, args, {
      stdio: [StdioOption.IGNORE, StdioOption.PIPE, StdioOption.IGNORE],
      env,
    });
    this.cp.stdout?.pipe(this.fileStream);
  }

  pause(): void {
    if (!this.cp || this._isPaused) return;

    // Delaying the SIGSTOP by a short moment allows the OS audio buffer to flush
    // the last spoken words before the process freezes.
    setTimeout(() => {
      if (!this.cp || this._isPaused) return;

      this.cp.kill(Signal.SIGSTOP);
      this._isPaused = true;
    }, 500);
  }

  resume(): void {
    if (!this.cp || !this._isPaused) return;

    this.cp.kill(Signal.SIGCONT);
    this._isPaused = false;
  }

  /** Stops the recording and resolves only when the audio file has been fully written to disk. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.cp) {
        resolve();
        return;
      }

      // If the process was paused, we MUST resume it first so it can process
      // the SIGINT/SIGTERM and flush any remaining buffer.
      if (this._isPaused) {
        this.cp.kill(Signal.SIGCONT);
        this._isPaused = false;
      }

      // Wait a brief moment to capture the trailing audio from the hardware buffer
      setTimeout(() => {
        if (this.cp) {
          // Attempt a graceful exit first (SIGINT) so wav headers and buffers can be flushed
          this.cp.kill(Signal.SIGINT);

          // Safety fallback to SIGTERM if it doesn't exit
          const fallback = setTimeout(() => {
            if (this.cp) this.cp.kill(Signal.SIGTERM);
          }, 500);

          this.cp.on(ProcessEvent.EXIT, () => clearTimeout(fallback));
          this.cp = null;
        }

        if (!this.fileStream) {
          resolve();
          return;
        }

        const stream = this.fileStream;
        this.fileStream = null;

        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };

        stream.on(StreamEvent.FINISH, done);
        stream.on(StreamEvent.CLOSE, done);
        stream.on(StreamEvent.ERROR, done);

        setTimeout(done, 1500);
      }, 500);
    });
  }

  getFilepath(): string {
    return this.filepath;
  }
}
