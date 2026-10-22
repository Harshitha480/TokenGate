const apiKeyService = require('../services/apiKeyService');

async function listKeys(req, res) {
  const keys = await apiKeyService.listKeys(req.user.userId);
  res.json({ data: keys.map(apiKeyService.toPublicKey) });
}

async function createKey(req, res) {
  const { apiKey, plaintextKey } = await apiKeyService.createKey(
    req.user.userId,
    req.validated.body,
  );
  // The only time the full key ever leaves the server.
  res.status(201).json({ key: apiKeyService.toPublicKey(apiKey), secret: plaintextKey });
}

async function getKey(req, res) {
  const apiKey = await apiKeyService.getOwnedKey(req.user.userId, req.validated.params.id);
  res.json({ key: apiKeyService.toPublicKey(apiKey) });
}

async function updateKey(req, res) {
  const apiKey = await apiKeyService.updateKey(
    req.user.userId,
    req.validated.params.id,
    req.validated.body,
  );
  res.json({ key: apiKeyService.toPublicKey(apiKey) });
}

async function revokeKey(req, res) {
  const apiKey = await apiKeyService.revokeKey(req.user.userId, req.validated.params.id);
  res.json({ key: apiKeyService.toPublicKey(apiKey) });
}

module.exports = { listKeys, createKey, getKey, updateKey, revokeKey };
