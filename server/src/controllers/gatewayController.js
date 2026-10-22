const { AppError, badRequest } = require('../lib/errors');
const { formatSSE } = require('../lib/sse');

/** Aborts upstream work when the client goes away before the response is finished. */
function abortOnClientDisconnect(res) {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort(new Error('Client disconnected'));
  });
  return controller.signal;
}

function setGatewayHeaders(res, meta) {
  res.set({
    'X-TokenGate-Provider': meta.provider,
    'X-TokenGate-Model': meta.servedModel,
    'X-TokenGate-Latency-Ms': String(meta.latencyMs),
    'X-TokenGate-Fallback': String(meta.fallbackUsed),
    'X-TokenGate-Cache': meta.cache,
  });
}

/** Resolves when the socket can take more data, or when the client has gone. */
function waitForDrain(res) {
  return new Promise((resolve) => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.on('drain', done);
    res.on('close', done);
  });
}

/**
 * Writes a streamed completion as Server-Sent Events. Each chunk is written as soon
 * as it arrives; when the socket buffer is full we wait for it to drain rather than
 * buffering an unbounded amount in memory.
 */
function createSseSink(res) {
  const writable = () => !res.writableEnded && !res.destroyed;

  return {
    start(meta) {
      setGatewayHeaders(res, meta);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Tell nginx and similar proxies not to buffer the stream.
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
    },
    async send(chunk) {
      if (writable() && !res.write(formatSSE(chunk))) await waitForDrain(res);
    },
    fail(error) {
      if (!writable()) return;
      res.write(formatSSE({ error }));
      res.end();
    },
    end() {
      if (!writable()) return;
      res.write(formatSSE('[DONE]'));
      res.end();
    },
  };
}

/**
 * Gateway behaviour a client can ask for per request:
 *   X-TokenGate-Cache: force             cache even when temperature is not 0
 *   X-TokenGate-Simulate-Failure: primary make the first provider fail (demo/testing)
 */
function readGatewayOptions(req, { allowFailureSimulation }) {
  const simulate = req.get('x-tokengate-simulate-failure');
  if (simulate !== undefined && simulate !== 'primary') {
    throw badRequest('X-TokenGate-Simulate-Failure only accepts "primary"');
  }
  if (simulate && !allowFailureSimulation) {
    throw new AppError(
      403,
      'failure_simulation_disabled',
      'Failure simulation is turned off on this gateway',
    );
  }
  return {
    forceCache: req.get('x-tokengate-cache')?.toLowerCase() === 'force',
    simulateFailure: simulate === 'primary',
  };
}

function createGatewayController({ gatewayService, modelCatalog, allowFailureSimulation }) {
  async function createChatCompletion(req, res) {
    const { forceCache, simulateFailure } = readGatewayOptions(req, { allowFailureSimulation });
    const params = {
      apiKey: req.apiKey,
      request: req.validated.body,
      requestId: req.id,
      signal: abortOnClientDisconnect(res),
      simulateFailure,
    };

    if (params.request.stream) {
      await gatewayService.streamChatCompletion({ ...params, sink: createSseSink(res) });
      return;
    }

    const result = await gatewayService.createChatCompletion({ ...params, forceCache });
    setGatewayHeaders(res, result.meta);
    res.json(result.body);
  }

  function listModels(req, res) {
    res.json({
      object: 'list',
      data: modelCatalog.list().map((model) => ({
        id: model.id,
        object: 'model',
        owned_by: model.provider,
      })),
    });
  }

  return { createChatCompletion, listModels };
}

module.exports = { createGatewayController };
