const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/posts — paginated feed
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const posts = await db.execute({
      sql: `SELECT p.id, p.content, p.media_url, p.created_at,
                   u.id as author_id, u.username as author_username, u.avatar as author_avatar,
                   (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
                   (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
            FROM posts p
            JOIN users u ON p.author_id = u.id
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?`,
      args: [limit, offset]
    });

    // Check if current user liked each post
    const postIds = posts.rows.map(p => p.id);
    let likedSet = new Set();
    if (postIds.length > 0) {
      const liked = await db.execute({
        sql: `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${postIds.map(() => '?').join(',')})`,
        args: [req.user.id, ...postIds]
      });
      likedSet = new Set(liked.rows.map(r => r.post_id));
    }

    const result = posts.rows.map(p => ({
      id: p.id,
      content: p.content,
      mediaUrl: p.media_url,
      createdAt: p.created_at,
      author: { id: p.author_id, username: p.author_username, avatar: p.author_avatar },
      likeCount: p.like_count,
      commentCount: p.comment_count,
      liked: likedSet.has(p.id)
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/posts — create post
router.post('/', protect, async (req, res) => {
  try {
    const { content, mediaUrl } = req.body;
    if (!content) return res.status(400).json({ message: 'Content is required' });

    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO posts (id, author_id, content, media_url) VALUES (?, ?, ?, ?)',
      args: [id, req.user.id, content, mediaUrl || '']
    });

    res.status(201).json({
      id,
      content,
      mediaUrl: mediaUrl || '',
      author: { id: req.user.id, username: req.user.username, avatar: req.user.avatar },
      likeCount: 0,
      commentCount: 0,
      liked: false
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/posts/:id/like — toggle like
router.put('/:id/like', protect, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const existing = await db.execute({
      sql: 'SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?',
      args: [postId, userId]
    });

    if (existing.rows.length > 0) {
      await db.execute({ sql: 'DELETE FROM likes WHERE post_id = ? AND user_id = ?', args: [postId, userId] });
    } else {
      await db.execute({ sql: 'INSERT INTO likes (post_id, user_id) VALUES (?, ?)', args: [postId, userId] });
    }

    const count = await db.execute({
      sql: 'SELECT COUNT(*) as total FROM likes WHERE post_id = ?',
      args: [postId]
    });

    res.json({ likes: count.rows[0].total, liked: existing.rows.length === 0 });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/posts/:id/comment
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { text } = req.body;
    const postId = req.params.id;

    const post = await db.execute({ sql: 'SELECT id FROM posts WHERE id = ?', args: [postId] });
    if (post.rows.length === 0) return res.status(404).json({ message: 'Post not found' });

    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO comments (id, post_id, author_id, text) VALUES (?, ?, ?, ?)',
      args: [id, postId, req.user.id, text]
    });

    const comments = await db.execute({
      sql: `SELECT c.id, c.text, c.created_at, u.id as author_id, u.username, u.avatar
            FROM comments c JOIN users u ON c.author_id = u.id
            WHERE c.post_id = ? ORDER BY c.created_at ASC`,
      args: [postId]
    });

    res.json(comments.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await db.execute({ sql: 'SELECT * FROM posts WHERE id = ?', args: [req.params.id] });
    if (post.rows.length === 0) return res.status(404).json({ message: 'Post not found' });

    if (post.rows[0].author_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not allowed' });

    await db.execute({ sql: 'DELETE FROM posts WHERE id = ?', args: [req.params.id] });
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
