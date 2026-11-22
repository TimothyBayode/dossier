/**
 * The browser-facing slice of the Forge bridge.
 *
 * `@forge/bridge` is CommonJS with a deep dependency tree and an exports map
 * that only exposes the package root, so this bundles the root and re-exports
 * the modules the surfaces use. That is what keeps the app buildless:
 * `static/ui/app.js` is plain ES and `vendor/bridge.js` is the only generated
 * asset. Rebuild with `npm run build:bridge` after changing the bridge version.
 */
import * as bridge from '@forge/bridge';

export const { invoke, view, router, events } = bridge;
