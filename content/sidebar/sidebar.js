// Sell it? Sidebar — Shadow DOM component
// Injected into brokerage pages; isolated from host page CSS

const TF_SIDEBAR = (() => {

  const STATES = ['idle', 'loading', 'done', 'error'];
  let host = null;
  let shadow = null;
  let _mounting = false;
  let _positions = null;

  // ── Build & Mount ───────────────────────────────────────────────────────

  async function mount() {
    if (document.getElementById('tf-sidebar-host')) return;
    if (_mounting) return;
    _mounting = true;

    try {
      host = document.createElement('div');
      host.id = 'tf-sidebar-host';
      document.body.appendChild(host);

      shadow = host.attachShadow({ mode: 'closed' });

      try {
        const cssText = await fetch(chrome.runtime.getURL('content/sidebar/sidebar.css'))
          .then(r => r.text());
        const style = document.createElement('style');
        style.textContent = cssText;
        shadow.appendChild(style);
      } catch (_) {}

      shadow.appendChild(_buildHTML());
      _attachListeners();
    } finally {
      _mounting = false;
    }
  }

  function _buildHTML() {
    const wrap = document.createElement('div');
    wrap.id = 'tf-sidebar';
    wrap.innerHTML = `
      <div id="tf-header">
        <button id="tf-toggle" title="Collapse">◀</button>
        <span class="tf-logo">Sell <span>it?</span></span>
      </div>

      <div id="tf-content">

        <!-- IDLE -->
        <div id="tf-state-idle" class="tf-state active">
          <p>Should you sell anything today?<br>Let AI check your positions.</p>
          <button class="tf-btn tf-btn-primary" id="tf-analyze-btn">Check Now</button>
        </div>

        <!-- LOADING -->
        <div id="tf-state-loading" class="tf-state">
          <div class="tf-spinner"></div>
          <p id="tf-loading-msg">Scanning positions…</p>
        </div>

        <!-- DONE -->
        <div id="tf-state-done" class="tf-state">
          <div class="tf-positions-meta" id="tf-positions-meta"></div>
          <pre class="tf-analysis-text" id="tf-analysis-text"></pre>
          <button class="tf-btn tf-btn-primary" id="tf-more-btn">See full analysis →</button>
        </div>

        <!-- ERROR -->
        <div id="tf-state-error" class="tf-state">
          <p id="tf-error-msg">Something went wrong.</p>
          <button class="tf-btn tf-btn-secondary" id="tf-back-btn">← Back</button>
        </div>

      </div>

      <div id="tf-footer">
        <span>sellit.app</span>
      </div>
    `;
    return wrap;
  }

  function _attachListeners() {
    const $ = (id) => shadow.getElementById(id);

    $('tf-toggle').addEventListener('click', () => {
      const sidebar = shadow.getElementById('tf-sidebar');
      const collapsed = sidebar.classList.toggle('collapsed');
      $('tf-toggle').textContent = collapsed ? '▶' : '◀';
    });

    $('tf-analyze-btn').addEventListener('click', () => analyze());
    $('tf-more-btn').addEventListener('click', async () => {
      // Stash positions so the frontend bridge can auto-import them
      if (_positions?.length) {
        await chrome.storage.local.set({
          pending_import: { positions: _positions, ts: Date.now() },
        });
      }
      window.open(TF_CONSTANTS.UPGRADE_URL, '_blank');
    });
    $('tf-back-btn').addEventListener('click', () => _setState('idle'));
  }

  // ── State machine ───────────────────────────────────────────────────────

  function _setState(name) {
    for (const s of STATES) {
      shadow.getElementById(`tf-state-${s}`)?.classList.toggle('active', s === name);
    }
  }

  function _setLoading(msg = 'Scanning positions…') {
    shadow.getElementById('tf-loading-msg').textContent = msg;
    _setState('loading');
  }

  function _setError(msg) {
    shadow.getElementById('tf-error-msg').textContent = msg;
    _setState('error');
  }

  function _setDone(analysis, positions) {
    shadow.getElementById('tf-analysis-text').textContent = analysis;
    shadow.getElementById('tf-positions-meta').textContent =
      `${positions.length} position${positions.length === 1 ? '' : 's'} checked`;
    _setState('done');
  }

  // ── Analyze flow ────────────────────────────────────────────────────────

  async function analyze() {
    _setLoading('Scanning positions…');

    let positions;
    try {
      positions = await TF_CONTENT.scrapeCurrentBrokerage();
    } catch (e) {
      _setError(`Could not read positions: ${e.message}`);
      return;
    }

    if (!positions || !positions.length) {
      _setError('No positions found. Navigate to your portfolio page first.');
      return;
    }

    _setLoading('Getting AI recommendation…');

    const result = await new Promise(resolve => {
      chrome.runtime.sendMessage(
        { type: TF_CONSTANTS.MSG.ANALYZE, positions },
        resolve
      );
    });

    if (result?.error) {
      _setError(result.error);
      return;
    }

    _positions = positions;
    _setDone(result.analysis, positions);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  return { mount };

})();
