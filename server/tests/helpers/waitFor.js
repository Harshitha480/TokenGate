/**
 * Polls until `check` returns a truthy value, for assertions on work the server
 * finishes after the response is sent (usage logging, key touch timestamps).
 */
async function waitFor(check, { timeoutMs = 2000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met before timeout');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

module.exports = { waitFor };
