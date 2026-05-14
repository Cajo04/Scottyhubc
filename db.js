const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'scottyhub.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_verified INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      wallet_balance REAL DEFAULT 0,
      otp_code TEXT,
      otp_expires TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS likes (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  console.log('✅ SQLite DB ready');
}

// Wrap sync API to match async interface used in routes
const dbAsync = {
  execute: ({ sql, args }) => {
    const stmt = db.prepare(sql);
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('WITH')) {
      return Promise.resolve({ rows: stmt.all(...(args || [])) });
    } else {
      const info = stmt.run(...(args || []));
      return Promise.resolve({ rows: [], info });
    }
  }
};

module.exports = { db: dbAsync, initDB };
