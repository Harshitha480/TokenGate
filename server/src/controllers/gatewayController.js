const { AppError, badRequest } = require('../lib/errors');

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
    const options = readGatewayOptions(req, { allowFailureSimulation });
    const result = await gatewayService.createChatCompletion({
      apiKey: req.apiKey,
      request: req.validated.body,
      requestId: req.id,
      signal: abortOnClientDisconnect(res),
      ...options,
    });
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
