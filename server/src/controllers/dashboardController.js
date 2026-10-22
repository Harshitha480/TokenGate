const statsService = require('../services/statsService');
const logService = require('../services/logService');

async function overview(req, res) {
  res.json(await statsService.getOverview(req.user.userId, req.validated.query));
}

async function timeseries(req, res) {
  const { range, metric, tz } = req.validated.query;
  res.json(await statsService.getTimeseries(req.user.userId, { range, metric, timeZone: tz }));
}

async function byModel(req, res) {
  res.json(await statsService.getByModel(req.user.userId, req.validated.query));
}

async function listLogs(req, res) {
  res.json(await logService.listLogs(req.user.userId, req.validated.query));
}

async function getLog(req, res) {
  res.json({ log: await logService.getLog(req.user.userId, req.validated.params.id) });
}

/** Models for the dashboard: the OpenAI list plus display names, prices and fallbacks. */
function createModelsController({ modelCatalog, providers }) {
  return function listModels(req, res) {
    res.json({
      data: modelCatalog.list().map((model) => ({
        id: model.id,
        displayName: model.displayName,
        provider: model.provider,
        pricing: model.pricing,
        fallbacks: model.fallbacks,
        available: providers[model.provider].isConfigured(),
      })),
    });
  };
}

module.exports = { overview, timeseries, byModel, listLogs, getLog, createModelsController };
