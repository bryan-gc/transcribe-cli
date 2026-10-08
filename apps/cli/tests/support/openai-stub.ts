import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface UploadedFile {
  name: string;
  type: string;
  content: Buffer;
}

export interface RecordedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  fields: Record<string, string[]>;
  file?: UploadedFile;
}

export interface Reply {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body: string | object;
}

export type Responder = (request: RecordedRequest, index: number) => Reply;

export interface SrtCue {
  start: number;
  end: number;
  text: string;
}

export interface DiarizedSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

function timestamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function srtBody(cues: SrtCue[]): string {
  return `${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}\n`,
    )
    .join('\n')}\n`;
}

export function diarizedBody(
  segments: DiarizedSegment[],
  usage = { input_tokens: 120, output_tokens: 40 },
): object {
  return {
    task: 'transcribe',
    duration: segments.at(-1)?.end ?? 0,
    text: segments.map((segment) => segment.text).join(' '),
    segments: segments.map((segment, index) => ({
      type: 'transcript.text.segment',
      id: `seg_${index}`,
      ...segment,
    })),
    usage: {
      type: 'tokens',
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.input_tokens + usage.output_tokens,
      input_token_details: { text_tokens: 0, audio_tokens: usage.input_tokens },
    },
  };
}

export function apiError(status: number, message: string, type = 'invalid_request_error'): Reply {
  return { status, body: { error: { message, type, param: null, code: null } } };
}

export function defaultReply(request: RecordedRequest): Reply {
  const model = request.fields.model?.[0];
  const format = request.fields.response_format?.[0];
  if (model === 'gpt-4o-transcribe-diarize') {
    return {
      body: diarizedBody([
        { speaker: 'A', start: 0, end: 1.5, text: 'Good morning, shall we start?' },
        { speaker: 'B', start: 1.5, end: 3, text: 'Yes, the report is ready.' },
      ]),
    };
  }
  if (format === 'srt') {
    return {
      contentType: 'text/plain; charset=utf-8',
      body: srtBody([{ start: 0, end: 2, text: 'Hello from the stub.' }]),
    };
  }
  return { body: { text: 'Hello from the stub.' } };
}

async function parseRequest(req: http.IncomingMessage, body: Buffer): Promise<RecordedRequest> {
  const recorded: RecordedRequest = {
    method: req.method ?? 'GET',
    path: req.url ?? '/',
    headers: req.headers,
    fields: {},
  };
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('multipart/form-data')) return recorded;
  const form = await new Request(`http://stub${recorded.path}`, {
    method: 'POST',
    headers: { 'content-type': type },
    body,
  }).formData();
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      recorded.fields[key] = [...(recorded.fields[key] ?? []), value];
      continue;
    }
    recorded.file = {
      name: value.name,
      type: value.type,
      content: Buffer.from(await value.arrayBuffer()),
    };
  }
  return recorded;
}

export class OpenAIStub {
  readonly requests: RecordedRequest[] = [];
  private responder: Responder = defaultReply;
  private readonly server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      void parseRequest(req, Buffer.concat(chunks)).then((recorded) => {
        const index = this.requests.length;
        this.requests.push(recorded);
        const reply = this.responder(recorded, index);
        const isText = typeof reply.body === 'string';
        res.writeHead(reply.status ?? 200, {
          'content-type':
            reply.contentType ?? (isText ? 'text/plain; charset=utf-8' : 'application/json'),
          'x-request-id': `req_stub_${index}`,
          ...reply.headers,
        });
        res.end(isText ? reply.body : JSON.stringify(reply.body));
      });
    });
  });

  async start(): Promise<this> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return this;
  }

  get baseUrl(): string {
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/v1`;
  }

  env(): Record<string, string> {
    return { OPENAI_BASE_URL: this.baseUrl };
  }

  respond(responder: Responder): void {
    this.responder = responder;
  }

  replies(...replies: Reply[]): void {
    this.responder = (request, index) =>
      replies[Math.min(index, replies.length - 1)] ?? defaultReply(request);
  }

  field(index: number, name: string): string | undefined {
    return this.requests[index]?.fields[name]?.[0];
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
