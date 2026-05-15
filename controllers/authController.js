const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db     = require('../config/db');

const SALT_ROUNDS = 12;

// ─── Register ──────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { name, email, password, phone } = req.body;

    const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length > 0) return res.status(409).json({ success: false, message: 'Email already registered.' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, phone) VALUES (?, ?, ?, ?)',
      [name, email, hash, phone || null]
    );

    // Create cart for user
    await db.query('INSERT INTO cart (user_id) VALUES (?)', [result.insertId]);

    const token = jwt.sign(
      { id: result.insertId, email, name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: { id: result.insertId, name, email, phone: phone || null },
    });
  } catch (err) { next(err); }
};

// ─── Login ─────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { email, password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

   res.cookie('token', token, {
  httpOnly: true,        // JS cannot read this cookie
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'none',      // needed for cross-domain (Vercel → Railway)
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
});
res.json({
  success: true,
  message: 'Login successful.',
  user: { ... }  // no token in response body anymore
});
  } catch (err) { next(err); }
};

// ─── Admin Login ───────────────────────────────────────────
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query('SELECT * FROM admin WHERE email = ? AND is_active = 1', [email]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, isAdmin: true, role: admin.role },
      process.env.JWT_ADMIN_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('adminToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'none',
  maxAge: 24 * 60 * 60 * 1000 // 1 day
});
res.json({
  success: true,
  message: 'Admin login successful.',
  admin: { ... }
});
  } catch (err) { next(err); }
};

// ─── Get Profile ───────────────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, phone, address, avatar_url, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (err) { next(err); }
};

// ─── Update Profile ────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, address } = req.body;
    await db.query(
      'UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?',
      [name, phone || null, address || null, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated successfully.' });
  } catch (err) { next(err); }
};
exports.logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none'
  });
  res.json({ success: true, message: 'Logged out.' });
};

exports.adminLogout = (req, res) => {
  res.clearCookie('adminToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none'
  });
  res.json({ success: true, message: 'Admin logged out.' });
};
