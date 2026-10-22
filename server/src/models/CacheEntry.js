const mongoose = require('mongoose');

const cacheEntrySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  // Stored as a JSON string: provider responses may contain keys MongoDB
  // restricts in field names (leading "$", dots), and we never query inside them.
  payload: { type: String, required: true },
  // MongoDB's TTL monitor deletes the document once this time passes.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

module.exports = mongoose.models.CacheEntry ?? mongoose.model('CacheEntry', cacheEntrySchema);
