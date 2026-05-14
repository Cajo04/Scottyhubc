const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { sendOTP, sendVerification } = require('../utils/email');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Google credential required' });

    // Verify Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) return res.status(400).json({ message: 'Google account has no email' });

    // Check if user already exists by email
    const existing = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    });

    if (existing.rows.length > 0) {
      // User exists — log them in (works for both Google and email/password users)
      const user = existing.rows[0];
      const token = generateToken(user.id);
      return res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar }
      });
    }

    // New user — create account (auto-verified, no password needed)
    const id = uuidv4();
    // Derive a clean username from Google name; ensure uniqueness with short suffix
    let baseUsername = (name || email.split('@')[0])
      .replace(/[^a-zA-Z0-9_]/g, '')
      .substring(0, 18) || 'user';
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const username = `${baseUsername}${suffix}`;
    const placeholderHash = await bcrypt.hash(uuidv4(), 10); // not used for login

    await db.execute({
      sql: `INSERT INTO users (id, username, email, password, avatar, is_verified)
            VALUES (?, ?, ?, ?, ?, 1)`,
      args: [id, username, email.toLowerCase(), placeholderHash, picture || '']
    });

    const token = generateToken(id);
    return res.status(201).json({
      token,
      user: { id, username, email: email.toLowerCase(), role: 'user', avatar: picture || '' }
    });

  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ message: 'Google sign-in failed. Invalid or expired token.' });
  }
});

// Helper: validate email via rapid-email-verifier (free, no API key needed)
const validateEmail = async (email) => {
  try {
    const res = await fetch(`https://rapid-email-verifier.fly.dev/verify?email=${encodeURIComponent(email)}`);
    if (!res.ok) return true; // fail open — don't block if API is down
    const data = await res.json();
    // disposable or invalid domain = reject; unknown = allow (fail open)
    if (data.disposable === true) return false;
    if (data.valid === false) return false;
    return true;
  } catch {
    return true; // fail open on network error
  }
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });

    // Validate email address
    const emailOk = await validateEmail(email);
    if (!emailOk)
      return res.status(400).json({ message: 'Please use a valid, non-disposable email address.' });

    // Check existing
    const exists = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ? OR username = ?',
      args: [email.toLowerCase(), username]
    });
    if (exists.rows.length > 0)
      return res.status(400).json({ message: 'Email or username already taken' });

    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.execute({
      sql: `INSERT INTO users (id, username, email, password, otp_code, otp_expires)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, username, email.toLowerCase(), hashedPassword, otp, otpExpires]
    });

    await sendVerification(email, username, otp);
    res.status(201).json({ message: 'Registered! Check your email for the verification code.', userId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/verify
router.post('/verify', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });

    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = result.rows[0];

    if (user.is_verified) return res.status(400).json({ message: 'Already verified' });
    if (!user.otp_code || user.otp_code !== otp || new Date() > new Date(user.otp_expires))
      return res.status(400).json({ message: 'Invalid or expired OTP' });

    await db.execute({
      sql: 'UPDATE users SET is_verified = 1, otp_code = NULL, otp_expires = NULL WHERE id = ?',
      args: [userId]
    });

    const token = generateToken(userId);
    res.json({
      message: 'Account verified!',
      token,
      user: { id: userId, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    });

    if (result.rows.length === 0)
      return res.status(401).json({ message: 'Invalid email or password' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    if (!user.is_verified)
      return res.status(403).json({ message: 'Please verify your email first' });

    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/send-otp  (forgot password / resend)
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    });

    if (result.rows.length === 0)
      return res.status(404).json({ message: 'No account with that email' });

    const user = result.rows[0];
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.execute({
      sql: 'UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?',
      args: [otp, otpExpires, user.id]
    });

    await sendOTP(email, user.username, otp);
    res.json({ message: 'OTP sent!', userId: user.id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });

    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = result.rows[0];

    if (!user.otp_code || user.otp_code !== otp || new Date() > new Date(user.otp_expires))
      return res.status(400).json({ message: 'Invalid or expired OTP' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.execute({
      sql: 'UPDATE users SET password = ?, otp_code = NULL, otp_expires = NULL WHERE id = ?',
      args: [hashedPassword, userId]
    });

    res.json({ message: 'Password reset successful!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
