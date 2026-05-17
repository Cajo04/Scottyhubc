const express = require('express');
const router = express.Router();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// POST /api/ai/chat — proxies to OpenRouter
router.post('/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ message: 'messages array is required' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://scottyhub.onrender.com',
        'X-Title': 'ScottyHub AI'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash:free',
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: 'You are ScottyAI, a friendly and helpful assistant created by Scotty for ScottyHub — a digital income and WhatsApp bot platform from Zimbabwe. Help users with WhatsApp bots using Baileys.js, JavaScript, Node.js, deploying on Render, making money online, and ScottyHub features. Always respond in English only. Never say you are DeepSeek or any other AI — you are ScottyAI. Be concise, friendly, and practical. Keep responses short and mobile-friendly.'
          },
          ...messages
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ message: data.error?.message || 'AI API error' });
    }

    res.json({
      content: [{ type: 'text', text: data.choices?.[0]?.message?.content || 'No response' }]
    });

  } catch (err) {
    console.error('AI proxy error:', err);
    res.status(500).json({ message: 'AI service temporarily unavailable' });
  }
});

module.exports = router;
