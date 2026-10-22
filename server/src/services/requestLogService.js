const RequestLog = require('../models/RequestLog');
const { logger: defaultLogger } = require('../lib/logger');

const MAX_LOGGED_TEXT_LENGTH = 8_000;

function truncate(text) {
  if (typeof text !== 'string') return undefined;
  return text.length > MAX_LOGGED_TEXT_LENGTH ? `${text.slice(0, MAX_LOGGED_TEXT_LENGTH)}…` : text;
}

/**
 * Persists one RequestLog per gateway request. Writes happen after the response
 * is sent and never throw: losing a usage row is better than failing a request
 * that already succeeded.
 *
 * @param {{ logPrompts: boolean, logger?: import('pino').Logger }} options
 */
function createRequestLogService({ logPrompts, logger = defaultLogger }) {
  function record(entry, { messages, completionText } = {}) {
    const doc = { ...entry };
    if (logPrompts) {
      doc.prompt = truncate(JSON.stringify(messages ?? []));
      doc.completion = truncate(completionText);
    }
    return RequestLog.create(doc).catch((err) => {
      logger.error({ err, requestId: entry.requestId }, 'Failed to write request log');
      return null;
    });
  }

  return { record };
}

module.exports = { createRequestLogService };
