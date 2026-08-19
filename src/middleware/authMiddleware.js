// Not used by any Sprint 1 endpoint yet — everything this
// sprint is public (register/login/reset). This exists now because every future sprint's
// protected routes (e.g. Super Admin creating an Admin, in Sprint 2) will need it.
//
// Usage later: router.post('/some-protected-route', verifyToken, controller.someHandler)
// controller can then read req.user.id / req.user.role

const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'legash-ci-secret-key-32-chars-long';

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

module.exports = verifyToken;