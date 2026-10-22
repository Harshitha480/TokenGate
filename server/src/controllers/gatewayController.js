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
  });
}

function createGatewayController({ gatewayService, modelCatalog }) {
  async function createChatCompletion(req, res) {
    const result = await gatewayService.createChatCompletion({
      apiKey: req.apiKey,
      request: req.validated.body,
      requestId: req.id,
      signal: abortOnClientDisconnect(res),
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
