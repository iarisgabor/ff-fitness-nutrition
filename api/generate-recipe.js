'use strict';

const {
  RECIPE_JSON_SCHEMA,
  buildRecipeSystemPrompt,
  buildRecipeUserMessage,
  validateRecipePayload,
  callClaude,
} = require('./_lib/nutrition');

const RECIPE_MAX_TOKENS = 1500;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = req.body;

  if (!validateRecipePayload(body)) {
    res.status(400).json({ error: 'invalid_payload' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  try {
    const recipe = await callClaude({
      system: buildRecipeSystemPrompt(),
      userMessage: buildRecipeUserMessage(body),
      schema: RECIPE_JSON_SCHEMA,
      maxTokens: RECIPE_MAX_TOKENS,
      effort: 'low',
    });
    res.status(200).json(recipe);
  } catch (err) {
    res.status(502).json({ error: 'upstream_failed', message: String(err) });
  }
};
