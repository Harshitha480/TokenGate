const RequestLog = require('../models/RequestLog');
const ApiKey = require('../models/ApiKey');
const { notFound } = require('../lib/errors');

// The list view stays light; prompts and completions are detail-only.
const LIST_PROJECTION = { prompt: 0, completion: 0, __v: 0 };

async function keyNamesFor(userId) {
  const keys = await ApiKey.find({ userId }).select('name').lean();
  return new Map(keys.map((key) => [key._id.toString(), key.name]));
}

function present(log, keyNames) {
  const { _id, apiKeyId, userId, ...fields } = log;
  return {
    id: _id.toString(),
    apiKeyId: apiKeyId.toString(),
    apiKeyName: keyNames.get(apiKeyId.toString()) ?? null,
    ...fields,
  };
}

/**
 * @param {string} userId
 * @param {{ page: number, limit: number, status?: string, model?: string, apiKeyId?: string, cached?: boolean, requestId?: string }} query
 */
async function listLogs(userId, { page, limit, status, model, apiKeyId, cached, requestId }) {
  const filter = { userId };
  if (status) filter.status = status;
  if (model) filter.model = model;
  if (apiKeyId) filter.apiKeyId = apiKeyId;
  if (cached !== undefined) filter.cached = cached;
  if (requestId) filter.requestId = requestId;

  const [rows, total, keyNames] = await Promise.all([
    RequestLog.find(filter, LIST_PROJECTION)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    RequestLog.countDocuments(filter),
    keyNamesFor(userId),
  ]);

  return {
    data: rows.map((row) => present(row, keyNames)),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

async function getLog(userId, logId) {
  const log = await RequestLog.findOne({ _id: logId, userId }).lean();
  if (!log) throw notFound('Request log not found');
  return present(log, await keyNamesFor(userId));
}

module.exports = { listLogs, getLog };
