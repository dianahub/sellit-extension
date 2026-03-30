// TradeFlow Content Main — brokerage detection & orchestration
// Loaded last in the content_scripts array; all other scripts are already defined

const TF_CONTENT = (() => {

  const BROKERS = [
    {
      id: 'etrade',
      handler: () => typeof TF_ETRADE !== 'undefined' ? TF_ETRADE : null,
    },
    {
      id: 'fidelity',
      handler: () => typeof TF_FIDELITY !== 'undefined' ? TF_FIDELITY : null,
    },
    {
      id: 'robinhood',
      handler: () => typeof TF_ROBINHOOD !== 'undefined' ? TF_ROBINHOOD : null,
    },
    {
      id: 'schwab',
      handler: () => typeof TF_SCHWAB !== 'undefined' ? TF_SCHWAB : null,
    },
  ];

  let _activeBroker = null;
  let _heartbeat = null;

  function detectBroker() {
    for (const b of BROKERS) {
      const h = b.handler();
      if (h && h.canHandle()) {
        _activeBroker = h;
        return h;
      }
    }
    return null;
  }

  async function scrapeCurrentBrokerage() {
    const broker = _activeBroker || detectBroker();
    if (!broker) throw new Error('Unsupported brokerage or not on a portfolio page');
    return broker.scrape();
  }

  // ── Mount + guard ─────────────────────────────────────────────────────────
  // Brokerage SPAs often replace document.body after the content script fires,
  // which removes any injected elements. We watch for removal and re-inject.

  function mountAndGuard() {
    TF_SIDEBAR.mount();
    _startGuard();
  }

  function _startGuard() {
    if (_heartbeat) return;
    _heartbeat = true;

    const start = Date.now();

    function check() {
      if (_activeBroker && !document.getElementById('tf-sidebar-host')) {
        TF_SIDEBAR.mount();
      }

      // Use rAF for the first 15 s (catches React's post-load DOM churn).
      // After that, a 3 s interval is plenty.
      if (Date.now() - start < 15000) {
        requestAnimationFrame(check);
      } else {
        setTimeout(check, 3000);
      }
    }

    requestAnimationFrame(check);
  }

  // ── SPA navigation detection ──────────────────────────────────────────────
  // Listen for history.pushState / replaceState so we can re-check canHandle()
  // when the user navigates to the portfolio page from elsewhere on the site.

  function _watchNavigation() {
    let lastUrl = location.href;

    // Patch history API
    const _patch = (method) => {
      const orig = history[method];
      history[method] = function (...args) {
        orig.apply(this, args);
        _onUrlChange();
      };
    };
    _patch('pushState');
    _patch('replaceState');
    window.addEventListener('popstate', _onUrlChange);
  }

  function _onUrlChange() {
    // Re-detect broker after URL change (canHandle() checks pathname)
    setTimeout(() => {
      _activeBroker = null;
      const broker = detectBroker();
      if (broker && !document.getElementById('tf-sidebar-host')) {
        mountAndGuard();
      }
    }, 500); // give SPA time to render new route
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    _watchNavigation();

    const broker = detectBroker();
    if (broker) {
      mountAndGuard();
    }
    // Even if not on portfolio page yet, navigation watcher will catch it
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { scrapeCurrentBrokerage, detectBroker };

})();
