'use strict';

const {
  PLAN_JSON_SCHEMA,
  buildSystemPrompt,
  buildUserMessage,
  validatePayload,
  callClaude,
} = require('./_lib/nutrition');

const PLAN_MAX_TOKENS = 11000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = req.body;

  if (!validatePayload(body)) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  try {
    const plan = await callClaude({
      system: buildSystemPrompt(),
      userMessage: buildUserMessage(body),
      schema: PLAN_JSON_SCHEMA,
      maxTokens: PLAN_MAX_TOKENS,
      effort: 'medium',
    });
    res.status(200).json(plan);
  } catch (err) {
    res.status(502).json({ error: 'upstream_failed', message: String(err) });
  }
};
