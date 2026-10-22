/**
 * Reads a fetch() Server-Sent Events body and yields each event's data payload.
 * Network chunks split lines (and CRLFs) arbitrarily, so bytes are buffered until a
 * whole line arrives. Mirrors server/src/lib/sse.js.
 */
export async function* readServerSentEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines = [];

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

      let lineEnd;
      while ((lineEnd = buffer.search(/\r\n|\n|\r(?!$)/)) !== -1) {
        const separator = buffer.startsWith('\r\n', lineEnd) ? 2 : 1;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + separator);

        if (line === '') {
          if (dataLines.length > 0) yield dataLines.join('\n');
          dataLines = [];
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }

      if (done) {
        if (buffer.startsWith('data:')) dataLines.push(buffer.slice(5).replace(/^ /, ''));
        if (dataLines.length > 0) yield dataLines.join('\n');
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
