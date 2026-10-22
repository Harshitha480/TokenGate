const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { config } = require('../config/env');
const { conflict, unauthorized, AppError } = require('../lib/errors');

const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'tokengate';

// Compared against when the email is unknown, so a failed login takes the same
// time whether or not the account exists (no user enumeration via timing).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 4);

function issueToken(user) {
  return jwt.sign({ role: user.role }, config.jwt.secret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: config.jwt.expiresIn,
    issuer: JWT_ISSUER,
    subject: user.id,
  });
}

async function register({ email, name, password }) {
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  try {
    const user = await User.create({ email, name, passwordHash });
    return { user, token: issueToken(user) };
  } catch (error) {
    if (error.code === 11000) throw conflict('An account with this email already exists');
    throw error;
  }
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) throw unauthorized('Email or password is incorrect');
  return { user, token: issueToken(user) };
}

/** Returns the token's claims, or throws a 401 describing why it was rejected. */
function verifyToken(token) {
  try {
    const claims = jwt.verify(token, config.jwt.secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
    });
    return { userId: claims.sub, role: claims.role };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(401, 'token_expired', 'Session expired, please sign in again');
    }
    throw new AppError(401, 'invalid_token', 'Session token is invalid');
  }
}

async function getUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw unauthorized('Account no longer exists');
  return user;
}

module.exports = { register, login, verifyToken, getUser };
