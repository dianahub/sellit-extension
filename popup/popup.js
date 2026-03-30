// Sell it? Popup

const MSG = {
  GET_SETTINGS:  'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  LOGIN:         'LOGIN',
  LOGOUT:        'LOGOUT',
};

// ── Helpers ───────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function send(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

function showError(elId, msg) {
  const el = $(elId);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(elId) {
  $(elId).classList.add('hidden');
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  const settings = await send({ type: MSG.GET_SETTINGS });

  if (settings.tradeflow_token && settings.tradeflow_user) {
    _showLoggedIn(settings.tradeflow_user);
  } else {
    _showLoggedOut(settings.claude_api_key);
  }
}

// ── Logged-in view ────────────────────────────────────────────────────────

function _showLoggedIn(user) {
  $('view-loggedin').classList.remove('hidden');
  $('view-loggedout').classList.add('hidden');
  $('user-email').textContent = user.email || user.name || 'Logged in';
}

// ── Logged-out view ───────────────────────────────────────────────────────

function _showLoggedOut(savedApiKey) {
  $('view-loggedout').classList.remove('hidden');
  $('view-loggedin').classList.add('hidden');

  if (savedApiKey) {
    // Show API key tab as active if key is already set
    _switchTab('apikey');
    $('input-apikey').value = '••••••••••••';
  }
}


// ── Tabs ──────────────────────────────────────────────────────────────────

function _switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `tab-${name}`);
  });
}

// ── Event listeners ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  init();

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
  });

  // Login
  $('btn-login').addEventListener('click', async () => {
    hideError('login-error');
    const email    = $('input-email').value.trim();
    const password = $('input-password').value;

    if (!email || !password) {
      showError('login-error', 'Please enter your email and password.');
      return;
    }

    $('btn-login').disabled = true;
    $('btn-login').textContent = 'Signing in…';

    const result = await send({ type: MSG.LOGIN, email, password });

    $('btn-login').disabled = false;
    $('btn-login').textContent = 'Sign In';

    if (result?.error) {
      showError('login-error', result.error);
      return;
    }

    _showLoggedIn(result.user);
  });

  // Allow Enter key in login form
  [$('input-email'), $('input-password')].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') $('btn-login').click();
    });
  });

  // Save API key
  $('btn-save-apikey').addEventListener('click', async () => {
    hideError('apikey-error');
    const key = $('input-apikey').value.trim();

    if (!key || key === '••••••••••••') {
      showError('apikey-error', 'Please enter your Anthropic API key.');
      return;
    }

    if (!key.startsWith('sk-ant-')) {
      showError('apikey-error', 'Key should start with sk-ant-');
      return;
    }

    $('btn-save-apikey').disabled = true;
    await send({ type: MSG.SAVE_SETTINGS, settings: { claude_api_key: key } });
    $('btn-save-apikey').disabled = false;
    $('btn-save-apikey').textContent = 'Saved ✓';
    setTimeout(() => { $('btn-save-apikey').textContent = 'Save Key'; }, 2000);
  });

  // Logout
  $('btn-logout').addEventListener('click', async () => {
    await send({ type: MSG.LOGOUT });
    $('input-email').value = '';
    $('input-password').value = '';
    _showLoggedOut(null);
  });
});
