const express = require('express');
const router = express.Router();

const KEY  = process.env.RAPIDAPI_KEY || '53375c26aemsh8bbd4d3b6338c66p15a84ejsna06fbbb10ec2';
const BASE = 'https://moviesdatabase.p.rapidapi.com';
const H    = { 'x-rapidapi-key': KEY, 'x-rapidapi-host': 'moviesdatabase.p.rapidapi.com', 'Content-Type': 'application/json' };

// GET /api/movies/trending
router.get('/trending', async (req, res) => {
  try {
    const r = await fetch(`${BASE}/titles?list=top_rated_english_250&limit=24&info=base_info`, { headers: H });
    if (!r.ok) return res.status(r.status).json({ error: `RapidAPI error ${r.status}` });
    const d = await r.json();
    res.json(d);
  } catch (e) {
    console.error('Movies trending error:', e.message);
    res.status(500).json({ error: 'Movies API unavailable' });
  }
});

// GET /api/movies/search?q=...
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Query required' });
  try {
    const r = await fetch(`${BASE}/titles/search/title/${encodeURIComponent(q)}?exact=false&info=base_info&limit=24`, { headers: H });
    if (!r.ok) return res.status(r.status).json({ error: `RapidAPI error ${r.status}` });
    const d = await r.json();
    res.json(d);
  } catch (e) {
    console.error('Movies search error:', e.message);
    res.status(500).json({ error: 'Movies API unavailable' });
  }
});

// GET /api/movies/:id/actors  — must come before /:id
router.get('/:id/actors', async (req, res) => {
  try {
    const r = await fetch(`${BASE}/titles/${req.params.id}/main_actors`, { headers: H });
    if (!r.ok) return res.status(r.status).json({ error: `RapidAPI error ${r.status}` });
    const d = await r.json();
    res.json(d);
  } catch (e) {
    console.error('Movie actors error:', e.message);
    res.status(500).json({ error: 'Movies API unavailable' });
  }
});

// GET /api/movies/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await fetch(`${BASE}/titles/${req.params.id}?info=base_info`, { headers: H });
    if (!r.ok) return res.status(r.status).json({ error: `RapidAPI error ${r.status}` });
    const d = await r.json();
    res.json(d);
  } catch (e) {
    console.error('Movie detail error:', e.message);
    res.status(500).json({ error: 'Movies API unavailable' });
  }
});

module.exports = router;
