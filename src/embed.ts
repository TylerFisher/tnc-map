/**
 * Iframe embedding support.
 *
 * Two modes, selected by query string:
 *
 *   ?embed=1        Hides the page heading, on the assumption the host page
 *                   supplies its own, and tightens the chrome.
 *   ?autoheight=1   Switches from "fill the iframe" to "grow to fit content"
 *                   and posts the required height to the parent. Useful on
 *                   narrow screens, where the sidebar stacks under the map and
 *                   the natural height varies with the roster.
 *
 * See README.md for the parent-page snippet.
 */

const MESSAGE_NAMESPACE = 'tnc-map';

export interface EmbedConfig {
  isEmbedded: boolean;
  autoHeight: boolean;
}

export function readEmbedConfig(): EmbedConfig {
  const params = new URLSearchParams(window.location.search);
  const isFramed = window.self !== window.top;

  return {
    // Treat any framed page as embedded unless it explicitly opts out.
    isEmbedded: params.get('embed') !== '0' && (params.get('embed') === '1' || isFramed),
    autoHeight: params.get('autoheight') === '1',
  };
}

export function applyEmbedConfig(config: EmbedConfig): void {
  const root = document.documentElement;
  root.classList.toggle('is-embedded', config.isEmbedded);
  root.classList.toggle('is-autoheight', config.autoHeight);

  const mapHeight = new URLSearchParams(window.location.search).get('height');
  if (config.autoHeight && mapHeight && /^\d{2,4}$/.test(mapHeight)) {
    root.style.setProperty('--map-height', `${mapHeight}px`);
  }
}

/**
 * Reports content height to the parent frame. No-ops outside an iframe and
 * when auto-height is off, so the common fixed-height embed pays nothing.
 */
export function startHeightReporting(config: EmbedConfig): void {
  if (!config.autoHeight || window.self === window.top) return;

  let lastHeight = 0;

  const post = (): void => {
    const height = Math.ceil(document.documentElement.scrollHeight);
    // Sub-pixel churn would otherwise produce a message per animation frame.
    if (Math.abs(height - lastHeight) < 2) return;
    lastHeight = height;
    // The parent origin is unknown (the embed is meant to be dropped on any
    // TNC page), and the payload is a single integer with no secrets in it.
    window.parent.postMessage({ type: `${MESSAGE_NAMESPACE}:height`, height }, '*');
  };

  new ResizeObserver(post).observe(document.body);
  window.addEventListener('load', post);
  post();
}

export function announceReady(): void {
  if (window.self === window.top) return;
  window.parent.postMessage({ type: `${MESSAGE_NAMESPACE}:ready` }, '*');
}
