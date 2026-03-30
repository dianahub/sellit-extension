// eTrade portfolio scraper
// Targets: https://us.etrade.com/etx/pxy/my-account/portfolio
//          https://edgetrade.etrade.com/...
//
// eTrade uses a React virtual-scroll grid with ARIA roles.
// CSS class names are hashed (e.g. "RowRenderer---root---C9M4t") and change
// between deployments — selectors use stable ARIA attributes only.

const TF_ETRADE = {

  canHandle() {
    // Hostname check is enforced by manifest host_permissions.
    return location.hostname.includes('etrade.com');
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

  // ── Wait for grid to render ───────────────────────────────────────────────

  _waitForData(maxMs = 20000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + maxMs;
      const check = () => {
        if (this._findRows().length > 0) return resolve();
        if (Date.now() > deadline) return reject(new Error('eTrade data timeout'));
        setTimeout(check, 500);
      };
      check();
    });
  },

  // ── Row detection ─────────────────────────────────────────────────────────

  _findRows() {
    // eTrade React grid: each position is a div[role="row"] with aria-rowindex.
    // Data rows contain a symbol link; header/total rows do not.
    const allRows = document.querySelectorAll('div[role="row"][aria-rowindex]');
    return [...allRows].filter(row => {
      // Must have a symbol cell (col 1) with an aria-label (the ticker)
      const col1 = row.querySelector('[aria-colindex="1"]');
      return col1 && col1.querySelector('[aria-label]');
    });
  },

  // ── Row parser ────────────────────────────────────────────────────────────

  _parseRow(row) {
    // Get text content of a specific column by aria-colindex
    const col = (idx) => {
      const cell = row.querySelector(`[aria-colindex="${idx}"]`);
      return cell?.textContent?.trim() ?? '';
    };

    // Symbol: stable via aria-label on the SymbolCellRenderer content div
    const col1 = row.querySelector('[aria-colindex="1"]');
    const symbolEl = col1?.querySelector('[aria-label]');
    const symbol = symbolEl?.getAttribute('aria-label')?.split(',')[0]?.trim()
      || col1?.querySelector('a')?.textContent?.trim();

    if (!symbol || symbol.length > 10) return null;

    // Column layout (confirmed from DOM inspection):
    // col 1  → symbol
    // col 2  → actions (alerts/notes) — skip
    // col 3  → last price
    // col 4  → today's change per share $
    // col 5  → today's change %
    // col 6  → quantity
    // col 7  → price paid per share (cost basis)
    // col 8  → today's total gain/loss $
    // col 9  → total gain/loss $
    // col 10 → total gain/loss %
    // col 11 → market value

    return {
      symbol:              symbol.toUpperCase(),
      asset_type:          this._assetType(symbol),
      quantity:            this._num(col(6)),
      price_paid:          this._num(col(7)),
      last_price:          this._num(col(3)),
      value:               this._num(col(11)),
      total_gain_dollar:   this._num(col(9)),
      total_gain_percent:  this._num(col(10).replace('%', '')),
      days_gain_dollar:    this._num(col(8)),
    };
  },

  // ── Helpers ───────────────────────────────────────────────────────────────

  _assetType(symbol) {
    if (/^[A-Z]{4}X$/.test(symbol)) return 'MUTUAL_FUND';
    return 'EQUITY';
  },

  _num(raw) {
    if (!raw || raw === '--' || raw === 'N/A') return 0;
    const negative = raw.includes('(') || raw.trimStart().startsWith('-');
    const cleaned  = raw.replace(/[$,%()]/g, '').replace(/,/g, '').trim();
    const n = parseFloat(cleaned);
    if (isNaN(n)) return 0;
    return negative && n > 0 ? -n : n;
  },
};
