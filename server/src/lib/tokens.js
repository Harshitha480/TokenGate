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

module.exports = { estimateTextTokens, estimateMessagesTokens, messageText };
