const { Router } = require('express');
const dashboard = require('../controllers/dashboardController');
const { validate } = require('../middleware/validate');
const { requireUser } = require('../middleware/auth');
const { idParams } = require('../validation/common');
const { rangeQuery, timeseriesQuery, logsQuery } = require('../validation/dashboardSchemas');

function createStatsRouter() {
  const router = Router();
  router.use(requireUser);
  router.get('/overview', validate({ query: rangeQuery }), dashboard.overview);
  router.get('/timeseries', validate({ query: timeseriesQuery }), dashboard.timeseries);
  router.get('/by-model', validate({ query: rangeQuery }), dashboard.byModel);
  return router;
}

function createLogsRouter() {
  const router = Router();
  router.use(requireUser);
  router.get('/', validate({ query: logsQuery }), dashboard.listLogs);
  router.get('/:id', validate({ params: idParams }), dashboard.getLog);
  return router;
}

function createModelsRouter(container) {
  const router = Router();
  router.use(requireUser);
  router.get('/', dashboard.createModelsController(container));
  return router;
}

module.exports = { createStatsRouter, createLogsRouter, createModelsRouter };
