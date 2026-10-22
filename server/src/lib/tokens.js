// About four characters per token is the usual rule of thumb for English text with
// BPE tokenizers. Used only when a provider does not report usage itself, and the
// resulting log entry is flagged as estimated.
const CHARS_PER_TOKEN = 4;
// Chat formats wrap each message in role markers and separators.
const TOKENS_PER_MESSAGE_OVERHEAD = 4;

function estimateTextTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function messageText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('');
  return '';
}

function estimateMessagesTokens(messages) {
  return messages.reduce(
    (total, message) =>
      total + TOKENS_PER_MESSAGE_OVERHEAD + estimateTextTokens(messageText(message.content)),
    0,
  );
}

/** Provider usage in OpenAI's shape, as { promptTokens, completionTokens }, or null. */
function normalizeUsage(usage) {
  if (!Number.isFinite(usage?.prompt_tokens) || !Number.isFinite(usage?.completion_tokens)) {
    return null;
  }
  return { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
}

/** Usage worked out from the text itself, for providers that do not report it. */
function estimateUsage(messages, completionText) {
  return {
    promptTokens: estimateMessagesTokens(messages),
    completionTokens: estimateTextTokens(completionText),
  };
}

module.exports = {
  estimateTextTokens,
  estimateMessagesTokens,
  estimateUsage,
  messageText,
  normalizeUsage,
};
