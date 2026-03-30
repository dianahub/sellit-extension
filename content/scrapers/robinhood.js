// Robinhood portfolio scraper
// Targets: https://robinhood.com/account/positions  (SPA, React)

const TF_ROBINHOOD = {

  canHandle() {
    return location.hostname.includes('robinhood.com') &&
      (location.pathname.includes('positions') ||
       location.pathname === '/' ||
       location.pathname.includes('account'));
  },

  async scrape() {
    await this._waitForData();
    return this._parsePositions();
  },

  // ── Wait helpers ──────────────────────────────────────────────────────────

  _waitForData(maxMs = 20000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + maxMs;

      // Robinhood is a SPA — we watch for position cards to mount
      const observer = new MutationObserver(() => {
        if (this._findCards().length > 0) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Also poll in case mutation already fired
      const check = () => {
        if (this._findCards().length > 0) {
          observer.disconnect();
          return resolve();
        }
        if (Date.now() > deadline) {
          observer.disconnect();
          return reject(new Error('Robinhood data timeout'));
        }
        setTimeout(check, 600);
      };
      check();
    });
  },

  _findCards() {
    const selectors = [
      '[data-testid="stock-position-card"]',
      '[data-testid="position-row"]',
      'li[class*="PositionListItem"]',
      'div[class*="PositionRow"]',
      'div[class*="HoldingCard"]',
      // Generic fallback: rows with a stock symbol pattern
      'a[href*="/stocks/"] div[class*="Row"]',
    ];
    for (const sel of selectors) {
      const cards = [...document.querySelectorAll(sel)];
      if (cards.length) return cards;
    }
    return [];
  },

  // ── Parser ────────────────────────────────────────────────────────────────

  _parsePositions() {
    const cards = this._findCards();
    if (!cards.length) return null;

    const positions = [];
    for (const card of cards) {
      const p = this._parseCard(card);
      if (p) positions.push(p);
    }
    return positions.length ? positions : null;
  },

  _parseCard(card) {
    const text = (sel) => card.querySelector(sel)?.textContent?.trim() ?? '';
    const textAlt = (...sels) => {
      for (const s of sels) {
        const t = card.querySelector(s)?.textContent?.trim();
        if (t) return t;
      }
      return '';
    };

    // Symbol is often in the href or a heading
    let symbol = text('[data-testid="symbol"]')
      || text('span[class*="Symbol"]')
      || text('h3')
      || '';

    // Try to extract from href if not found
    if (!symbol) {
      const link = card.closest('a') || card.querySelector('a[href*="/stocks/"]');
      if (link) {
        const match = link.href.match(/\/stocks\/([A-Z]+)/i);
        if (match) symbol = match[1];
      }
    }

    if (!symbol) return null;

    const sharesRaw   = textAlt('[data-testid="shares"]', 'span[class*="shares"]', 'span[class*="Shares"]');
    const lastRaw     = textAlt('[data-testid="last-price"]', 'span[class*="Price"]', 'span[class*="price"]');
    const equityRaw   = textAlt('[data-testid="equity"]', 'span[class*="Equity"]', 'span[class*="Value"]');
    const avgRaw      = textAlt('[data-testid="average-cost"]', 'span[class*="Cost"]', 'span[class*="Avg"]');
    const totalRaw    = textAlt('[data-testid="total-return"]', 'span[class*="TotalReturn"]', 'span[class*="Gain"]');
    const todayRaw    = textAlt('[data-testid="today-return"]', 'span[class*="TodayReturn"]', 'span[class*="Today"]');

    const quantity          = this._num(sharesRaw);
    const last_price        = this._num(lastRaw);
    const value             = this._num(equityRaw);
    const price_paid        = this._num(avgRaw);
    const total_gain_dollar = this._num(totalRaw);
    const days_gain_dollar  = this._num(todayRaw);

    // Derive percent from dollar if available
    const cost_basis = price_paid * quantity;
    const total_gain_percent = cost_basis > 0
      ? parseFloat(((total_gain_dollar / cost_basis) * 100).toFixed(2))
      : 0;

    return {
      symbol:              symbol.toUpperCase(),
      asset_type:          'EQUITY',   // Robinhood shows stocks/ETFs on this page
      quantity,
      price_paid,
      last_price,
      value,
      total_gain_dollar,
      total_gain_percent,
      days_gain_dollar,
    };
  },

  _num(raw) {
    if (!raw || raw === '--' || raw === 'N/A') return 0;
    const negative = raw.includes('(') || raw.startsWith('-') || raw.includes('−');
    const cleaned  = raw.replace(/[$,%()−]/g, '').replace(/,/g, '').trim();
    const n = parseFloat(cleaned);
    if (isNaN(n)) return 0;
    return negative && n > 0 ? -n : n;
  },
};
