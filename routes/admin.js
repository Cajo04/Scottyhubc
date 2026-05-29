const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ── USERS ─────────────────────────────────────────
// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const result = await db.execute(
      'SELECT id, username, email, role, avatar, bio, wallet_balance, is_verified, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
    await db.execute({ sql: 'UPDATE users SET role = ? WHERE id = ?', args: [role, req.params.id] });
    res.json({ message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/wallet/topup
router.post('/wallet/topup', async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    if (!userId || !amount || isNaN(amount)) return res.status(400).json({ message: 'userId and amount required' });
    const result = await db.execute({ sql: 'SELECT wallet_balance FROM users WHERE id = ?', args: [userId] });
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const newBalance = (result.rows[0].wallet_balance || 0) + parseFloat(amount);
    await db.execute({ sql: 'UPDATE users SET wallet_balance = ? WHERE id = ?', args: [newBalance, userId] });
    await db.execute({
      sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)',
      args: [uuidv4(), userId, 'topup', parseFloat(amount), description || 'Admin top-up']
    });
    res.json({ message: 'Wallet topped up', balance: newBalance });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/wallet/deduct
router.post('/wallet/deduct', async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    if (!userId || !amount || isNaN(amount)) return res.status(400).json({ message: 'userId and amount required' });
    const result = await db.execute({ sql: 'SELECT wallet_balance FROM users WHERE id = ?', args: [userId] });
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const newBalance = Math.max(0, (result.rows[0].wallet_balance || 0) - parseFloat(amount));
    await db.execute({ sql: 'UPDATE users SET wallet_balance = ? WHERE id = ?', args: [newBalance, userId] });
    await db.execute({
      sql: 'INSERT INTO wallet_transactions (id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)',
      args: [uuidv4(), userId, 'deduct', parseFloat(amount), description || 'Admin deduction']
    });
    res.json({ message: 'Wallet deducted', balance: newBalance });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── NEWS ──────────────────────────────────────────
// GET /api/admin/news
router.get('/news', async (req, res) => {
  try {
    const result = await db.execute(
      'SELECT * FROM news ORDER BY created_at DESC'
    );
    res.json({ news: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/news
router.post('/news', async (req, res) => {
  try {
    const { title, body, icon, color, category } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'title and body required' });
    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO news (id, title, body, icon, color, category, author_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, title, body, icon || 'newspaper', color || '#00ffcc', category || 'general', req.user.id]
    });
    const result = await db.execute({ sql: 'SELECT * FROM news WHERE id = ?', args: [id] });
    res.status(201).json({ message: 'News created', news: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/news/:id
router.put('/news/:id', async (req, res) => {
  try {
    const { title, body, icon, color, category } = req.body;
    await db.execute({
      sql: 'UPDATE news SET title=COALESCE(?,title), body=COALESCE(?,body), icon=COALESCE(?,icon), color=COALESCE(?,color), category=COALESCE(?,category) WHERE id=?',
      args: [title||null, body||null, icon||null, color||null, category||null, req.params.id]
    });
    const result = await db.execute({ sql: 'SELECT * FROM news WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'News updated', news: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/news/:id
router.delete('/news/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM news WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'News deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POSTS ─────────────────────────────────────────
// GET /api/admin/posts
router.get('/posts', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT p.id, p.content, p.media_url, p.created_at,
                   u.id as author_id, u.username as author_username
            FROM posts p JOIN users u ON p.author_id = u.id
            ORDER BY p.created_at DESC LIMIT 100`
    });
    res.json({ posts: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/posts/:id
router.delete('/posts/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM posts WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/posts — post as admin/announcement
router.post('/posts', async (req, res) => {
  try {
    const { content, mediaUrl } = req.body;
    if (!content) return res.status(400).json({ message: 'Content required' });
    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO posts (id, author_id, content, media_url) VALUES (?, ?, ?, ?)',
      args: [id, req.user.id, content, mediaUrl || '']
    });
    res.status(201).json({ message: 'Post created', id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── STATS ─────────────────────────────────────────
// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const users = await db.execute('SELECT COUNT(*) as total FROM users');
    const verified = await db.execute('SELECT COUNT(*) as total FROM users WHERE is_verified=1');
    const posts = await db.execute('SELECT COUNT(*) as total FROM posts');
    const news = await db.execute('SELECT COUNT(*) as total FROM news');
    const totalCops = await db.execute('SELECT COALESCE(SUM(wallet_balance),0) as total FROM users');
    res.json({
      totalUsers: users.rows[0].total,
      verifiedUsers: verified.rows[0].total,
      totalPosts: posts.rows[0].total,
      totalNews: news.rows[0].total,
      totalCopsInCirculation: totalCops.rows[0].total
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── ANNOUNCEMENTS (broadcast post) ────────────────
// POST /api/admin/announce — pin a message to top of feed
router.post('/announce', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: 'Content required' });
    // Clear old pinned posts
    await db.execute({ sql: 'UPDATE posts SET pinned=0 WHERE pinned=1' });
    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO posts (id, author_id, content, media_url, pinned) VALUES (?, ?, ?, ?, 1)',
      args: [id, req.user.id, content, '']
    });
    res.status(201).json({ message: 'Announcement posted', id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
