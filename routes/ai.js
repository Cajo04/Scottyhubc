const express = require('express');
const router = express.Router();

// POST /api/ai/chat — proxies to Anthropic so the API key stays server-side
router.post('/chat', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ message: 'AI service not configured. Add ANTHROPIC_API_KEY to .env' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ message: 'messages array is required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'You are ScottyAI, the helpful assistant for ScottyHub — a digital income and WhatsApp bot platform from Zimbabwe. Help users with WhatsApp bots using Baileys.js, JavaScript, Node.js, deploying on Render, making money online, and ScottyHub features. Be concise, friendly, and practical. Keep responses short and mobile-friendly.',
        messages
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ message: data.error?.message || 'AI API error' });
    }
    res.json(data);
  } catch (err) {
    console.error('AI proxy error:', err);
    res.status(500).json({ message: 'AI service temporarily unavailable' });
  }
});

module.exports = router;
