const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const normalizeRole = (role) => {
  if (typeof role !== 'string') {
    return '';
  }
  return role.trim().toLowerCase();
};

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === 'authority') {
      const authorityResult = await pool.query('SELECT * FROM authorities WHERE id = $1 AND is_active = true', [decoded.id]);
      if (authorityResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid token or user not found.' });
      }
      req.user = { ...authorityResult.rows[0], role: 'authority' };
      req.userType = 'authority';
      return next();
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.id]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token or user not found.' });
    }
    req.user = { ...userResult.rows[0], role: normalizeRole(userResult.rows[0].role) };
    req.userType = 'user';
    return next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.warn(`Auth token expired at ${error.expiredAt?.toISOString?.() || 'unknown time'}`);
      return res.status(401).json({ error: 'Token expired' });
    }

    console.error('Auth error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles) => {
  const allowedRoles = roles.map(normalizeRole);

  return (req, res, next) => {
    console.log('=== AUTHORIZE MIDDLEWARE ===');
    console.log('Required roles:', allowedRoles);
    console.log('User role:', req.user?.role);
    console.log('User type:', req.userType);
    console.log('Authority level:', req.user?.authority_level);

    if (!req.user || !req.user.role) {
      console.log('Authorization FAILED - No user or role in token');
      return res.status(403).json({ error: 'Access denied - Invalid token payload' });
    }

    // Handle authority role with levels
    if (req.userType === 'authority') {
      if (allowedRoles.includes('authority')) {
        console.log('Authorization SUCCESS - Authority access');
        return next();
      }
      // Check specific authority levels
      if (allowedRoles.includes(normalizeRole(req.user.authority_level))) {
        console.log('Authorization SUCCESS - Authority level access');
        return next();
      }
    }
    
    // Handle regular user roles
    if (req.userType === 'user' && allowedRoles.includes(normalizeRole(req.user.role))) {
      console.log('Authorization SUCCESS - User role access');
      return next();
    }

    console.log('Authorization FAILED - Role mismatch');
    return res.status(403).json({ 
      error: `Access denied - Required: ${allowedRoles.join('|')}, Got: ${req.user.role}`,
      userType: req.userType,
      authorityLevel: req.user?.authority_level
    });
  };
};

module.exports = { authenticate, authorize };
