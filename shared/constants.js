// Shared constants used across content scripts and service worker

const TF_CONSTANTS = {
  MSG: {
    ANALYZE:        'ANALYZE_POSITIONS',
    GET_SETTINGS:   'GET_SETTINGS',
    SAVE_SETTINGS:  'SAVE_SETTINGS',
    LOGIN:          'LOGIN',
    LOGOUT:         'LOGOUT',
  },

  BROKERAGES: {
    etrade:    { name: 'E*TRADE',   color: '#6633cc' },
    fidelity:  { name: 'Fidelity',  color: '#008000' },
    robinhood: { name: 'Robinhood', color: '#00c805' },
    schwab:    { name: 'Schwab',    color: '#00a0dd' },
  },

  TRADEFLOW_URL:    TF_CONFIG.FRONTEND,
  UPGRADE_URL:      TF_CONFIG.FRONTEND,
};
