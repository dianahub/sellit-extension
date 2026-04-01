// Auto-detects dev vs production.
// Unpacked (dev) extensions have no update_url in the manifest.
// Published Chrome Web Store extensions always have one.

const isProd = !!chrome.runtime.getManifest().update_url;

globalThis.TF_CONFIG = isProd ? {
  API:      'https://tradeflow-production-c4ff.up.railway.app/api',
  FRONTEND: 'https://sellit-portfolio-dashboard.vercel.app',
} : {
  API:      'https://tradeflow.ddev.site/api',
  FRONTEND: 'http://localhost:5173',
};
