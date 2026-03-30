// Charles Schwab portfolio scraper
// Targets: https://client.schwab.com/app/accounts/positions

const TF_SCHWAB = {

  canHandle() {
    return location.hostname.includes('schwab.com') &&
      (location.pathname.includes('positions') || location.pathname.includes('accounts'));
  },

  async scrape() {
    await this._waitForData();
    const rows = this._findRows();
    if (!rows.length) return null;

    const positions = [];
    for (const row of rows) {
      const p = this._parseRow(row);
      if (p) positions.push(p);
    }
    return positions.length ? positions : null;
  },

  // ── Wait helpers ──────────────────────────────────────────────────────────

  _waitForData(maxMs = 20000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + maxMs;

      const check = () => {
        if (this._findRows().length > 0) return resolve();
        if (Date.now() > deadline) return reject(new Error('Schwab data timeout'));
        setTimeout(check, 500);
      };
      check();
    });
  },

  _findRows() {
    // Schwab uses web components and custom elements
    const selectors = [
      // Angular/custom element table rows
      'app-positions-table tbody tr',
      'schwab-positions-grid .row-data',
      '[data-row-type="position"]',
      // Standard table fallbacks
      'table.positions-table tbody tr',
      '.positions-list-row',
      '.position-item',
      // Generic with data attributes
      'tr[data-symbol]',
      'tr[data-ticker]',
    ];

    for (const sel of selectors) {
      const rows = [...document.querySelectorAll(sel)].filter(r => {
        // Skip header, total, and spacer rows
        const text = r.textContent.trim();
        return text.length > 0 &&
          !r.querySelector('th') &&
          !r.classList.contains('totals') &&
          !r.classList.contains('header');
      });
      if (rows.length) return rows;
    }
    return [];
  },

  // ── Row parser ────────────────────────────────────────────────────────────

  _parseRow(row) {
    const cell = (...sels) => {
      for (const s of sels) {
        const el = row.querySelector(s);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return '';
    };

    const td = (idx) => row.querySelectorAll('td')[idx]?.textContent?.trim() ?? '';

    // Schwab column layout varies; try attribute-based first
    const symbolRaw    = row.dataset.symbol || row.dataset.ticker
      || cell('[data-col="symbol"]', '[class*="symbol"]', '.symbol-col')
      || td(0);
    const quantityRaw  = cell('[data-col="quantity"]', '[class*="qty"]', '.quantity-col') || td(1);
    const lastPriceRaw = cell('[data-col="price"]', '[class*="last-price"]', '.price-col') || td(2);
    const pricePaidRaw = cell('[data-col="costBasis"]', '[class*="avg-cost"]', '.avg-cost-col') || td(4);
    const valueRaw     = cell('[data-col="value"]', '[class*="market-value"]', '.value-col') || td(5);
    const totalGainRaw = cell('[data-col="gainLoss"]', '[class*="total-gain"]', '.gain-col') || td(6);
    const totalGainPct = cell('[data-col="gainLossPct"]', '[class*="gain-pct"]', '.gain-pct-col') || td(7);
    const daysGainRaw  = cell('[data-col="dayChange"]', '[class*="day-gain"]', '.day-change-col') || td(3);

    // Clean symbol (Schwab sometimes appends account info)
    const symbol = symbolRaw.split(/\s+/)[0].toUpperCase();
    if (!symbol || symbol.length > 10 || symbol === 'SYMBOL' || symbol === '--') return null;

    return {
      symbol,
      asset_type:          this._assetType(symbol, row.textContent),
      quantity:            this._num(quantityRaw),
      price_paid:          this._num(pricePaidRaw),
      last_price:          this._num(lastPriceRaw),
      value:               this._num(valueRaw),
      total_gain_dollar:   this._num(totalGainRaw),
      total_gain_percent:  this._num(totalGainPct.replace('%', '')),
      days_gain_dollar:    this._num(daysGainRaw),
    };
  },

  _assetType(symbol, rowText = '') {
    const lower = rowText.toLowerCase();
    if (lower.includes(' call ') || lower.includes(' put ')) return 'OPTION';
    if (/^[A-Z]{4}X$/.test(symbol)) return 'MUTUAL_FUND';
    return 'EQUITY';
  },

  _num(raw) {
    if (!raw || raw === '--' || raw === 'N/A' || raw === 'N/A%') return 0;
    const negative = raw.includes('(') || raw.startsWith('-');
    const cleaned  = raw.replace(/[$,%()]/g, '').replace(/,/g, '').trim();
    const n = parseFloat(cleaned);
    if (isNaN(n)) return 0;
    return negative && n > 0 ? -n : n;
  },
};
