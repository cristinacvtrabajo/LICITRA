const express = require('express');
const router  = express.Router();

/**
 * POST /api/ia/groq
 * Proxy seguro entre el frontend y la API de Groq.
 * La API key nunca sale del servidor.
 */
router.post('/groq', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'GROQ_API_KEY no configurada en el servidor'
    });
  }

  const { model, messages, max_tokens = 1000, temperature = 0.4 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ success: false, error: 'Campo messages requerido' });
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model:       model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages,
        max_tokens,
        temperature
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '');
      console.warn('[Groq proxy] Error HTTP', groqRes.status, errText);
      return res.status(groqRes.status).json({ success: false, error: errText });
    }

    const data = await groqRes.json();
    res.json({ success: true, data });

  } catch (err) {
    console.error('[Groq proxy] Fallo de red:', err.message);
    res.status(500).json({ success: false, error: 'Error de red al contactar Groq' });
  }
});

module.exports = router;
