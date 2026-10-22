const authService = require('../services/authService');

async function register(req, res) {
  const { user, token } = await authService.register(req.validated.body);
  res.status(201).json({ user, token });
}

async function login(req, res) {
  const { user, token } = await authService.login(req.validated.body);
  res.json({ user, token });
}

async function me(req, res) {
  const user = await authService.getUser(req.user.userId);
  res.json({ user });
}

module.exports = { register, login, me };
