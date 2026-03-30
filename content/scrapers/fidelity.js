// Fidelity portfolio scraper
// Targets: https://www.fidelity.com/wealth/accounts/positions

const TF_FIDELITY = {

  canHandle() {
    return location.hostname.includes('fidelity.com') &&
      (location.pathname.includes('positions') || location.pathname.includes('portfolio'));
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

      // Fidelity uses AG Grid — rows appear after JS hydration
      const check = () => {
        const rows = this._findRows();
        if (rows.length > 0) return resolve();
        if (Date.now() > deadline) return reject(new Error('Fidelity data timeout'));
        setTimeout(check, 500);
      };
      check();
    });
  },

  _findRows() {
    const selectors = [
      // AG Grid rows
      '.ag-center-cols-container .ag-row[row-index]',
      '.ag-row[row-id]',
      // Legacy table
      'table.p-table tbody tr',
      'table[data-testid="positions-table"] tbody tr',
      '.positions-table tbody tr',
      // React table
      '[data-testid="position-row"]',
    ];
    for (const sel of selectors) {
      const rows = [...document.querySelectorAll(sel)];
      // Filter out totals/header rows
      const data = rows.filter(r => !r.classList.contains('ag-row-group') && !r.classList.contains('totals-row'));
      if (data.length) return data;
    }
    return [];
  },

  // ── Row parser ────────────────────────────────────────────────────────────

  _parseRow(row) {
    // AG Grid stores values in cells with col-id attributes
    const agCell = (colId) => {
      const el = row.querySelector(`[col-id="${colId}"]`);
      return el?.textContent?.trim() ?? '';
    };

    // Fidelity AG Grid column IDs
    const symbolRaw    = agCell('symbol')    || agCell('SYMBOL')    || this._legacyCell(row, 0);
    const nameRaw      = agCell('description')|| agCell('name')     || this._legacyCell(row, 1);
    const quantityRaw  = agCell('quantity')  || agCell('QTY')       || this._legacyCell(row, 2);
    const lastPriceRaw = agCell('lastPrice') || agCell('LAST_PRICE')|| this._legacyCell(row, 3);
    const pricePaidRaw = agCell('costPerShare')|| agCell('COST_SHARE')|| this._legacyCell(row, 5);
    const valueRaw     = agCell('currentValue')|| agCell('VALUE')   || this._legacyCell(row, 6);
    const totalGainRaw = agCell('gainLoss')  || agCell('TOTAL_GAIN')|| this._legacyCell(row, 7);
    const totalGainPct = agCell('gainLossPct')|| agCell('TOTAL_GAIN_PCT')|| this._legacyCell(row, 8);
    const daysGainRaw  = agCell('todaysGainLoss')|| this._legacyCell(row, 4);

    const symbol = symbolRaw.split('\n')[0].trim();   // sometimes name is concatenated
    if (!symbol || symbol === '--' || symbol === 'Symbol') return null;

    return {
      symbol:              symbol.toUpperCase(),
      asset_type:          this._assetType(symbol, nameRaw),
      quantity:            this._num(quantityRaw),
      price_paid:          this._num(pricePaidRaw),
      last_price:          this._num(lastPriceRaw),
      value:               this._num(valueRaw),
      total_gain_dollar:   this._num(totalGainRaw),
      total_gain_percent:  this._num(totalGainPct.replace('%', '')),
      days_gain_dollar:    this._num(daysGainRaw),
    };
  },

  _legacyCell(row, idx) {
    return row.querySelectorAll('td')[idx]?.textContent?.trim() ?? '';
  },

  _assetType(symbol, name = '') {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('call') || nameLower.includes('put')) return 'OPTION';
    if (nameLower.includes('fund') || nameLower.includes('etf')) return 'EQUITY';
    if (/^[A-Z]{4}X$/.test(symbol)) return 'MUTUAL_FUND';
    return 'EQUITY';
  },

  _num(raw) {
    if (!raw || raw === '--' || raw === 'N/A') return 0;
    const negative = raw.includes('(') || raw.startsWith('-');
    const cleaned  = raw.replace(/[$,%()]/g, '').replace(/,/g, '').trim();
    const n = parseFloat(cleaned);
    if (isNaN(n)) return 0;
    return negative && n > 0 ? -n : n;
  },
};
