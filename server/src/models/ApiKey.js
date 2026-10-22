const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    // Only a SHA-256 digest of the key is stored; the plaintext is shown once at creation.
    keyHash: { type: String, required: true, unique: true, select: false },
    prefix: { type: String, required: true },
    lastFour: { type: String, required: true },
    // null means "use the server default", so changing the default reaches every such key.
    rateLimitPerMinute: { type: Number, default: null, min: 1 },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

apiKeySchema.index({ userId: 1, createdAt: -1 });

apiKeySchema.virtual('isActive').get(function isActive() {
  return this.revokedAt === null;
});

module.exports = mongoose.models.ApiKey ?? mongoose.model('ApiKey', apiKeySchema);
