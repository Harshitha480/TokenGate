const http = require('node:http');

/**
 * A real HTTP server standing in for an OpenAI-compatible provider, so adapter
 * tests exercise actual sockets, status codes, timeouts and aborts.
 *
 * `handler(req, res, body)` decides each response; every request is recorded.
 */
async function startFakeUpstream(handler) {
  const requests = [];
  const sockets = new Set();

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ headers: req.headers, body });
      handler(req, res, body);
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

module.exports = { startFakeUpstream, sendJson };
