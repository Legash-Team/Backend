// Backend/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const Hospital = require('../models/Hospital');
const Donor = require('../models/Donor');
const SuperAdmin = require('../models/SuperAdmin');
const Admin = require('../models/Admin');

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'legash-ci-secret-key-32-chars-long';

  try {
    const decoded = jwt.verify(token, secret);
    let actor = null;

    if (decoded.role === 'hospital') {
      actor = await Hospital.findById(decoded.id);
    } else if (decoded.role === 'donor') {
      actor = await Donor.findById(decoded.id);
    } else if (decoded.role === 'superadmin') {
      actor = await SuperAdmin.findById(decoded.id);
    } else if (decoded.role === 'admin') {
      actor = await Admin.findById(decoded.id);
    }

    if (!actor || actor.isDeleted) {
      return res.status(401).json({ success: false, error: 'Account not found or deactivated.' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

module.exports = verifyToken;