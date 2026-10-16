const {verifySession} = require('../session');

// Deja en req.user el usuario de la sesión o responde 401.
async function requireAuth(req, res, next) {
  const user = await verifySession(req.headers.authorization);
  if (!user) return res.status(401).json({error: 'Inicia sesión'});
  req.user = user;
  next();
}

module.exports = {requireAuth};
