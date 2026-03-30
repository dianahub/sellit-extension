// Sell it? Frontend Bridge
// Runs on the React frontend (localhost:5173 / sellit-portfolio-dashboard.vercel.app)
// Reads pending positions from extension storage and fires a custom event
// that App.jsx listens for to auto-import positions.

(async () => {
  const result = await chrome.storage.local.get('pending_import');
  const pending = result.pending_import;

  if (!pending?.positions?.length) return;

  // Ignore stale imports (older than 5 minutes)
  if (Date.now() - pending.ts > 5 * 60 * 1000) {
    chrome.storage.local.remove('pending_import');
    return;
  }

  // Clear immediately so a refresh doesn't re-import
  chrome.storage.local.remove('pending_import');

  // Wait for the React app to mount (it renders after DOMContentLoaded)
  const dispatch = () => {
    window.dispatchEvent(new CustomEvent('sellit:import-positions', {
      detail: { positions: pending.positions },
    }));
  };

  if (document.readyState === 'complete') {
    // Small delay to let React render and set up its event listener
    setTimeout(dispatch, 800);
  } else {
    window.addEventListener('load', () => setTimeout(dispatch, 800));
  }
})();
