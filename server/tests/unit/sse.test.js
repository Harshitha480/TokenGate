const { parseSSE, formatSSE } = require('../../src/lib/sse');

const encoder = new TextEncoder();

async function* bytesFrom(parts) {
  for (const part of parts) yield typeof part === 'string' ? encoder.encode(part) : part;
}

async function collect(parts) {
  const events = [];
  for await (const data of parseSSE(bytesFrom(parts))) events.push(data);
  return events;
}

describe('parseSSE', () => {
  it('yields the data of each event', async () => {
    const events = await collect(['data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n']);

    expect(events).toEqual(['{"a":1}', '{"b":2}', '[DONE]']);
  });

  it('produces the same events however the bytes are split', async () => {
    const stream = 'data: {"text":"héllo"}\r\n\r\n: keep-alive\n\ndata: second\n\ndata: [DONE]\n\n';
    const bytes = encoder.encode(stream);
    const expected = ['{"text":"héllo"}', 'second', '[DONE]'];

    // Every possible two-way split, including inside "é" and between "\r" and "\n".
    for (let cut = 1; cut < bytes.length; cut += 1) {
      expect(await collect([bytes.slice(0, cut), bytes.slice(cut)])).toEqual(expected);
    }
    // And one byte at a time.
    expect(await collect([...bytes].map((b) => Uint8Array.of(b)))).toEqual(expected);
  });

  it('joins multi-line data and ignores comments and other fields', async () => {
    const events = await collect([
      ': comment\nevent: message\nid: 7\ndata: line one\ndata: line two\n\n',
    ]);

    expect(events).toEqual(['line one\nline two']);
  });

  it('emits a final event that is missing its trailing blank line', async () => {
    expect(await collect(['data: last'])).toEqual(['last']);
  });
});

describe('formatSSE', () => {
  it('serialises objects and passes literals through', () => {
    expect(formatSSE({ a: 1 })).toBe('data: {"a":1}\n\n');
    expect(formatSSE('[DONE]')).toBe('data: [DONE]\n\n');
  });
});
