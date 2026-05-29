require('dotenv').config({ path: '/etc/secrets/.env' });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./db');

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const postRoutes     = require('./routes/posts');
const aiRoutes       = require('./routes/ai');
const moviesRoutes   = require('./routes/movies');
const sportsRoutes   = require('./routes/sports');
const downloadRoutes = require('./routes/download');
const adminRoutes    = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3004;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, slow down!'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many auth attempts, try again later.'
});

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(limiter);

const frontendDir = path.join(__dirname, 'public');
app.use(express.static(frontendDir));

app.get('/api', (req, res) => {
  res.json({ status: 'ScottyHub API is running 🚀', version: '2.0.0', db: 'SQLite' });
});

app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/posts',    postRoutes);
app.use('/api/ai',       aiRoutes);
app.use('/api/movies',   moviesRoutes);
app.use('/api/sports',   sportsRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/admin',    adminRoutes);

// Public news endpoint (anyone logged-in can read)
const { db } = require('./db');
const { protect } = require('./middleware/auth');
app.get('/api/news', protect, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM news ORDER BY created_at DESC');
    res.json({ news: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong' });
});

try {
  initDB();
  app.listen(PORT, () => console.log(`🚀 ScottyHub running on port ${PORT}`));
} catch (err) {
  console.error('❌ DB init failed:', err.message);
  process.exit(1);
}
