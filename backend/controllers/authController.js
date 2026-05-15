const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');
const { validatePhoneNumber } = require('../utils/phoneUtils');

const normalizeRole = (role) => {
  if (typeof role !== 'string') {
    return '';
  }

  return role.trim().toLowerCase();
};

const register = async (req, res) => {
  const { email, password, fullName, phone } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || !password || !fullName) {
    return res.status(400).json({ error: 'Email, password, and full name are required' });
  }
  
  // Validate phone number if provided
  if (phone && !validatePhoneNumber(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }
  
  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone)
       VALUES ($1, $2, 'citizen', $3, $4)
       RETURNING id, email, role, full_name`,
      [normalizedEmail, passwordHash, fullName, phone || null]
    );
    
    const user = result.rows[0];
    const normalizedRole = normalizeRole(user.role);
    
    res.status(201).json({
      message: 'Registration successful',
      user: {
        ...user,
        role: normalizedRole
      }
    });

    auditLog(user.id, 'USER_REGISTERED', 'user', user.id, { email: normalizedEmail, hasPhone: !!phone }, req.ip);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, role, full_name, ward_id, is_active
       FROM users WHERE email = $1`,
      [normalizedEmail]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const normalizedRole = normalizeRole(user.role);
    
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: normalizedRole },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: normalizedRole,
        fullName: user.full_name,
        wardId: user.ward_id
      }
    });

    auditLog(user.id, 'USER_LOGIN', 'user', user.id, { email: normalizedEmail }, req.ip);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

const authorityLogin = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, full_name, authority_level, jurisdiction_id, category_id, department, is_active
       FROM authorities WHERE email = $1`,
      [normalizedEmail]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const authority = result.rows[0];
    
    if (!authority.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    if (!authority.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValidPassword = await bcrypt.compare(password, authority.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: authority.id, email: authority.email, role: 'authority', authority_level: authority.authority_level },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: authority.id,
        email: authority.email,
        role: 'authority',
        fullName: authority.full_name,
        authorityLevel: authority.authority_level,
        jurisdictionId: authority.jurisdiction_id,
        categoryId: authority.category_id,
        department: authority.department
      }
    });

    auditLog(authority.id, 'AUTHORITY_LOGIN', 'authority', authority.id, { email: normalizedEmail }, req.ip);
  } catch (error) {
    console.error('Authority login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

module.exports = { register, login, authorityLogin };
