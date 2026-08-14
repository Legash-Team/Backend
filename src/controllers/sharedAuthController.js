const Hospital = require('../models/Hospital');
const SuperAdmin = require('../models/SuperAdmin');
const { comparePassword } = require('../utils/hashPassword');
const generateToken = require('../utils/generateToken');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const lowerEmail = email.toLowerCase().trim();

    // 1. Check Hospital collection first
    const hospital = await Hospital.findOne({ email: lowerEmail });

    if (hospital) {
      // Check if email is verified
      const isVerified = hospital.isEmailVerified || hospital.emailVerified;
      if (!isVerified) {
        return res.status(401).json({
          success: false,
          error: 'Please verify your email before logging in.'
        });
      }

      // Check password
      const isMatch = await comparePassword(password, hospital.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.'
        });
      }

      // Generate token
      const token = generateToken({ id: hospital._id, role: 'hospital' });

      return res.status(200).json({
        success: true,
        token,
        role: 'hospital',
        user: {
          id: hospital._id,
          name: hospital.name,
          email: hospital.email
        }
      });
    }

    // 2. Check SuperAdmin collection
    const superAdmin = await SuperAdmin.findOne({ email: lowerEmail });

    if (superAdmin) {
      const isMatch = await comparePassword(password, superAdmin.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password.'
        });
      }

      const token = generateToken({ id: superAdmin._id, role: 'superadmin' });

      return res.status(200).json({
        success: true,
        token,
        role: 'superadmin',
        user: {
          id: superAdmin._id,
          name: superAdmin.name,
          email: superAdmin.email
        }
      });
    }

    // 3. No account found with that email
    return res.status(401).json({
      success: false,
      error: 'Invalid email or password.'
    });

  } catch (error) {
    next(error);
  }
};