// Sell it? Extension — Background Service Worker (Manifest V3)
// All cross-origin API calls must go through here (content scripts cannot call external APIs directly)

import '../shared/config.js'; // sets globalThis.TF_CONFIG

const MSG = {
  ANALYZE:             'ANALYZE_POSITIONS',
  GET_SETTINGS:        'GET_SETTINGS',
  SAVE_SETTINGS:       'SAVE_SETTINGS',
  LOGIN:               'LOGIN',
  LOGOUT:              'LOGOUT',
  GET_PENDING_IMPORT:  'GET_PENDING_IMPORT',
  CLEAR_PENDING_IMPORT:'CLEAR_PENDING_IMPORT',
};

const TRADEFLOW_API = TF_CONFIG.API;

// ── Message router ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case MSG.ANALYZE:
      handleAnalyze(msg.positions).then(sendResponse);
      return true;

    case MSG.GET_SETTINGS:
      chrome.storage.sync.get(null).then(sendResponse);
      return true;

    case MSG.SAVE_SETTINGS:
      chrome.storage.sync.set(msg.settings).then(() => sendResponse({ ok: true }));
      return true;

    case MSG.LOGIN:
      handleLogin(msg.email, msg.password).then(sendResponse);
      return true;

    case MSG.LOGOUT:
      chrome.storage.sync.remove(['tradeflow_token', 'tradeflow_user'])
        .then(() => sendResponse({ ok: true }));
      return true;

    case MSG.GET_PENDING_IMPORT:
      chrome.storage.local.get('pending_import').then(sendResponse);
      return true;

    case MSG.CLEAR_PENDING_IMPORT:
      chrome.storage.local.remove('pending_import').then(() => sendResponse({ ok: true }));
      return true;
  }
});

// ── Analysis handler ───────────────────────────────────────────────────────────

async function handleAnalyze(positions) {
  const settings = await chrome.storage.sync.get([
    'tradeflow_token', 'claude_api_key',
  ]);

  // Mode A: logged-in token (future paid users)
  if (settings.tradeflow_token) {
    return callTradeflowBackend(positions, settings.tradeflow_token);
  }

  // Mode B: user's own Anthropic API key
  if (settings.claude_api_key) {
    return callClaudeDirectly(positions, settings.claude_api_key);
  }

  // Mode C: free anonymous endpoint (default — no login needed)
  return callFreeEndpoint(positions);
}

// ── API callers ────────────────────────────────────────────────────────────────

async function callTradeflowBackend(positions, token) {
  try {
    await fetch(`${TRADEFLOW_API}/positions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(positions),
    });

    const res = await fetch(`${TRADEFLOW_API}/positions/sell-recommendations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json();
      return { error: err.message || 'API error' };
    }

    const data = await res.json();
    return { analysis: data.analysis };

  } catch (e) {
    return { error: `Network error: ${e.message}` };
  }
}

async function callClaudeDirectly(positions, apiKey) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: buildSellPrompt(positions) }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { analysis: data.content[0].text };
    }

    const err = await res.json();
    return { error: err.error?.message || `Claude API error (${res.status})` };

  } catch (e) {
    return { error: `Network error: ${e.message}` };
  }
}

async function callFreeEndpoint(positions) {
  try {
    const res = await fetch(`${TRADEFLOW_API}/analyze-free`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ positions }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { error: data.error || 'Analysis unavailable' };
    }

    return { analysis: data.analysis };
  } catch (e) {
    return { error: `Network error: ${e.message}` };
  }
}

function buildSellPrompt(positions) {
  const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0).toFixed(2);
  const totalGain  = positions.reduce((sum, p) => sum + (p.total_gain_dollar || 0), 0).toFixed(2);
  const lines = positions.map(p =>
    `${p.symbol} (${p.asset_type}): qty=${p.quantity}, paid=$${p.price_paid}, now=$${p.last_price}, value=$${p.value}, total_gain=$${p.total_gain_dollar} (${p.total_gain_percent}%), today=$${p.days_gain_dollar}`
  ).join('\n');

  return `You are a professional portfolio manager. Identify the SINGLE most important position to sell right now, if any.

PORTFOLIO (Total Value: $${totalValue}, Total P&L: $${totalGain}):
${lines}

Respond in this exact format:

TOP SELL: [SYMBOL] — [one sentence reason using the actual numbers]

If nothing should be sold:

TOP SELL: Nothing to sell right now — [one sentence on what to watch]

Rules: Use ONLY the numbers provided. No RSI/MACD. Be direct.`;
}

// ── Login ──────────────────────────────────────────────────────────────────────

async function handleLogin(email, password) {
  try {
    const res = await fetch(`${TRADEFLOW_API}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { error: data.message || 'Login failed' };
    }

    await chrome.storage.sync.set({
      tradeflow_token: data.token,
      tradeflow_user:  data.user,
    });

    return { ok: true, user: data.user };

  } catch (e) {
    return { error: `Network error: ${e.message}` };
  }
}
