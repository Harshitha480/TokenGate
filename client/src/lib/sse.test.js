import { describe, expect, it } from 'vitest';
import { readServerSentEvents } from './sse.js';

function streamOf(parts) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

async function collect(parts) {
  const events = [];
  for await (const data of readServerSentEvents(streamOf(parts))) events.push(data);
  return events;
}

describe('readServerSentEvents', () => {
  it('yields each event even when chunks split lines and CRLFs', async () => {
    const text = 'data: {"a":1}\r\n\r\n: ping\n\ndata: {"b":2}\n\ndata: [DONE]\n\n';
    const expected = ['{"a":1}', '{"b":2}', '[DONE]'];

    for (let cut = 1; cut < text.length; cut += 1) {
      expect(await collect([text.slice(0, cut), text.slice(cut)])).toEqual(expected);
    }
  });

  it('emits a trailing event without a blank line', async () => {
    expect(await collect(['data: last'])).toEqual(['last']);
  });
});
