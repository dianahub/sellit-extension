// ONE FILE TO CHANGE when switching dev ↔ production
// Edit the two active lines below, then reload the extension.

// dev
globalThis.TF_CONFIG = {
  API:      'https://tradeflow.ddev.site/api',
  FRONTEND: 'http://localhost:5173',
};

// prod (uncomment below and comment out dev above)
// globalThis.TF_CONFIG = {
//   API:      'https://tradeflow-production-c4ff.up.railway.app/api',
//   FRONTEND: 'https://sellit-portfolio-dashboard.vercel.app',
// };
