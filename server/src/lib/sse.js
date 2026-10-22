/**
 * Parses a Server-Sent Events byte stream into the `data` payload of each event.
 *
 * Network chunks do not respect event boundaries: a chunk can end mid-line, mid
 * UTF-8 character, or between the "\r" and "\n" of a CRLF. Bytes are buffered until
 * a full line is available, and an event is emitted at each blank line.
 *
 * @param {AsyncIterable<Uint8Array>} byteStream  e.g. fetch's response.body
 * @returns {AsyncGenerator<string>}
 */
async function* parseSSE(byteStream) {
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines = [];

  function* takeLines(final) {
    for (;;) {
      const lineEnd = buffer.search(/[\r\n]/);
      if (lineEnd === -1) break;
      // A trailing "\r" may be half of a CRLF whose "\n" is in the next chunk.
      if (buffer[lineEnd] === '\r' && lineEnd === buffer.length - 1 && !final) break;
      const separatorLength = buffer[lineEnd] === '\r' && buffer[lineEnd + 1] === '\n' ? 2 : 1;
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + separatorLength);
      yield line;
    }
  }

  function* handleLine(line) {
    if (line === '') {
      if (dataLines.length > 0) yield dataLines.join('\n');
      dataLines = [];
      return;
    }
    if (line.startsWith(':')) return; // comment, used by servers as a keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  }

  for await (const chunk of byteStream) {
    buffer += decoder.decode(chunk, { stream: true });
    for (const line of takeLines(false)) yield* handleLine(line);
  }

  buffer += decoder.decode();
  for (const line of takeLines(true)) yield* handleLine(line);
  if (buffer !== '') yield* handleLine(buffer);
  if (dataLines.length > 0) yield dataLines.join('\n');
}

/** Formats one SSE event carrying a JSON (or literal) payload. */
function formatSSE(payload) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return `data: ${data}\n\n`;
}

module.exports = { parseSSE, formatSSE };
