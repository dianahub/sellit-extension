// eTrade portfolio scraper
// Targets: https://us.etrade.com/etx/pxy/my-account/portfolio
//          https://edgetrade.etrade.com/...
//
// eTrade uses a React virtual-scroll grid with ARIA roles.
// CSS class names are hashed (e.g. "RowRenderer---root---C9M4t") and change
// between deployments — selectors use stable ARIA attributes only.

const TF_ETRADE = {

  canHandle() {
    return location.hostname.includes('etrade.com') &&
      (location.pathname.includes('portfolio') || location.pathname.includes('positions'));
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
    // eTrade React grid uses div[role="row"] for all rows.
    // Equity rows have aria-colindex cells; option rows do NOT — they have a
    // different cell renderer with no aria-colindex attributes.
    // We detect each type separately.
    const allRows = [...document.querySelectorAll('div[role="row"]')];

    return allRows.filter(row => {
      // Skip header rows
      if (row.querySelector('[role="columnheader"]')) return false;

      // Equity row: has aria-colindex="1" with a non-header ticker
      const col1 = row.querySelector('[aria-colindex="1"]');
      if (col1) {
        const firstLine = (col1.textContent?.trim() ?? '').split(/[\n\r]/)[0].trim();
        return firstLine.length > 0 &&
          !/^(symbol|total|account|subtotal|options|equities)$/i.test(firstLine);
      }

      // Option row: has an <a> whose title contains "Call" or "Put"
      return !!row.querySelector('a[title*="Call"], a[title*="Put"]');
    });
  },

  // ── Row parser ────────────────────────────────────────────────────────────

  _parseRow(row) {
    // Option rows have no aria-colindex — detect by the option link title
    const optionLink = row.querySelector('a[title*="Call"], a[title*="Put"]');
    if (optionLink) return this._parseOptionRow(row, optionLink);

    // ── Equity row (aria-colindex cells) ──────────────────────────────────
    const col = (idx) => {
      const cell = row.querySelector(`[aria-colindex="${idx}"]`);
      return cell?.textContent?.trim() ?? '';
    };

    const col1 = row.querySelector('[aria-colindex="1"]');
    let symbol = col1?.querySelector('a')?.textContent?.trim();

    if (!symbol) {
      const ariaLabel = col1?.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
      symbol = ariaLabel.split(',')[0].trim();
    }
    if (symbol && symbol.length > 10) symbol = symbol.split(/\s+/)[0];
    if (!symbol || symbol.length > 10) return null;

    // Column layout:
    // col 1=symbol, col 3=last price, col 4=change$, col 5=change%,
    // col 6=quantity, col 7=price paid, col 8=today's gain$,
    // col 9=total gain$, col 10=total gain%, col 11=market value
    return {
      symbol:              symbol.toUpperCase(),
      asset_type:          this._assetType(symbol),
      option_type:         null,
      strike_price:        null,
      expiration_date:     null,
      underlying_symbol:   null,
      quantity:            this._num(col(6)),
      price_paid:          this._num(col(7)),
      last_price:          this._num(col(3)),
      value:               this._num(col(11)),
      total_gain_dollar:   this._num(col(9)),
      total_gain_percent:  this._num(col(10).replace('%', '')),
      days_gain_dollar:    this._num(col(8)),
    };
  },

  _parseOptionRow(row, optionLink) {
    // All option info is in the <a title>, e.g. "UCO Apr 17 '26 $45 Call"
    const title  = optionLink.getAttribute('title') ?? '';
    const symbol = optionLink.textContent?.trim();
    if (!symbol || symbol.length > 10) return null;

    const isCall = /\bCall\b/i.test(title);
    const isPut  = /\bPut\b/i.test(title);

    // Strike: "$45", "$145.00", "$1,500"
    let strikePrice = null;
    const strikeMatch = title.match(/\$([0-9,]+(?:\.[0-9]+)?)/);
    if (strikeMatch) strikePrice = parseFloat(strikeMatch[1].replace(/,/g, ''));

    // Expiration: "Apr 17 '26" or "Apr 17 2026"
    let expirationDate = null;
    const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const dateMatch = title.match(/([A-Z][a-z]{2})\s+(\d{1,2})[,\s]+'?(\d{2,4})/);
    if (dateMatch) {
      const month = MONTHS[dateMatch[1]];
      const day   = parseInt(dateMatch[2], 10);
      let year    = parseInt(dateMatch[3], 10);
      if (year < 100) year += 2000;
      if (month !== undefined) {
        expirationDate = new Date(year, month, day).toISOString().slice(0, 10);
      }
    }

    // Numeric columns — option rows have cells without aria-colindex.
    // Read them by DOM order: skip col1 (symbol cell) and get remaining cells.
    const cells = [...row.querySelectorAll('[role="gridcell"], [role="cell"]')];
    const cText = (i) => cells[i]?.textContent?.trim() ?? '';
    // eTrade option column order (0-based after symbol cell stripped):
    // 0=symbol(skip), 1=last price, 2=change$, 3=change%, 4=qty,
    // 5=price paid, 6=today gain$, 7=total gain$, 8=total gain%, 9=value
    return {
      symbol:             symbol.toUpperCase(),
      asset_type:         'option',
      option_type:        isCall ? 'CALL' : (isPut ? 'PUT' : null),
      strike_price:       strikePrice,
      expiration_date:    expirationDate,
      underlying_symbol:  symbol.toUpperCase(),
      last_price:         this._num(cText(1)),
      days_gain_dollar:   this._num(cText(2)),
      quantity:           this._num(cText(4)),
      price_paid:         this._num(cText(5)),
      total_gain_dollar:  this._num(cText(7)),
      total_gain_percent: this._num(cText(8).replace('%', '')),
      value:              this._num(cText(9)),
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
