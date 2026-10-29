/**
 * FEEDBACK-HUB: Lightweight Embeddable Client Telemetry SDK (<12KB)
 * 
 * Embed in any web application:
 * <script src="https://hub.yourdomain.com/v1/sdk.js" data-product-key="prod_live_xxx"></script>
 */
(function (window, document) {
  const currentScript = document.currentScript;
  const productKey = currentScript ? currentScript.getAttribute('data-product-key') : null;
  const endpoint = currentScript ? (currentScript.getAttribute('data-endpoint') || 'http://localhost:5001') : 'http://localhost:5001';

  const collectedConsoleLogs = [];
  const collectedNetworkErrors = [];

  // 1. Intercept Global JavaScript Errors
  window.addEventListener('error', function (event) {
    collectedConsoleLogs.push({
      type: 'error',
      message: event.message + ' at ' + (event.filename || 'unknown') + ':' + event.lineno,
      timestamp: new Date().toLocaleTimeString()
    });
    if (collectedConsoleLogs.length > 20) collectedConsoleLogs.shift();
  });

  // 2. Intercept Unhandled Promise Rejections
  window.addEventListener('unhandledrejection', function (event) {
    collectedConsoleLogs.push({
      type: 'error',
      message: 'Unhandled Promise Rejection: ' + (event.reason ? event.reason.message || event.reason : 'unknown'),
      timestamp: new Date().toLocaleTimeString()
    });
    if (collectedConsoleLogs.length > 20) collectedConsoleLogs.shift();
  });

  // 3. Intercept Failed Fetch Requests (4xx / 5xx)
  if (window.fetch) {
    const nativeFetch = window.fetch;
    window.fetch = async function (...args) {
      try {
        const response = await nativeFetch.apply(this, args);
        if (!response.ok && response.status >= 400) {
          collectedNetworkErrors.push({
            url: typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || 'unknown',
            status: response.status,
            method: (args[1] && args[1].method) || 'GET',
            timestamp: new Date().toLocaleTimeString()
          });
          if (collectedNetworkErrors.length > 10) collectedNetworkErrors.shift();
        }
        return response;
      } catch (networkError) {
        collectedNetworkErrors.push({
          url: typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || 'unknown',
          status: 0,
          method: 'NETWORK_FAILURE',
          timestamp: new Date().toLocaleTimeString()
        });
        throw networkError;
      }
    };
  }

  // 4. Expose Global Public SDK API
  window.FeedbackHub = {
    getProductKey: function () {
      return productKey;
    },
    getTelemetry: function () {
      return {
        page_url: window.location.href,
        domain_origin: window.location.hostname,
        user_agent: navigator.userAgent,
        viewport_dimensions: window.innerWidth + 'x' + window.innerHeight,
        console_logs: collectedConsoleLogs.slice(),
        network_errors: collectedNetworkErrors.slice()
      };
    },
    submitIncident: async function (payload) {
      if (!productKey) {
        console.error('[FeedbackHub] Missing data-product-key on script tag.');
        return;
      }
      // Support either an object payload or legacy parameter arguments
      const data = typeof payload === 'object' ? payload : {
        title: arguments[0],
        description: arguments[1],
        category: arguments[2] || 'BUG',
        severity: arguments[3] || 'MEDIUM',
        sensitive_data: arguments[4]
      };

      return fetch(endpoint + '/api/v1/ingest/ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Product-Key': productKey
        },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          category: data.category || 'BUG',
          severity: data.severity || 'MEDIUM',
          rating: data.rating,
          screenshot: data.screenshot,
          reporter_email: data.reporter_email,
          telemetry: {
            ...window.FeedbackHub.getTelemetry(),
            ...(data.telemetry || {})
          },
          sensitive_data: data.sensitive_data
        })
      });
    }
  };

  console.log('[FeedbackHub SDK] Initialized with telemetry listeners active.');
})(window, document);
