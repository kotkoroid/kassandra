// Bun ↔ Node compatibility polyfill.
//
// Vite 8.0.13 bundles `http-proxy`, which calls `socket.destroySoon()`
// when tearing down a proxied WebSocket upgrade. Bun's `net.Socket`
// prototype doesn't implement `destroySoon` — the crash:
//
//   TypeError: socket.destroySoon is not a function
//     at .../vite@8.0.13/.../node.js:17536:13
//
// breaks every WS upgrade routed through Vite's `server.proxy`
// (`ws: true`) when Vite runs under Bun — including the alchemy-dev
// embedded Vite. Behaviour-wise `destroySoon` is "flush then close";
// `socket.end()` is the same shape. Polyfilling at Bun startup
// patches every Socket the runtime hands out before any Vite code
// touches it.
//
// Loaded via `[run].preload = ["./scripts/bun-preload.ts"]` in
// `bunfig.toml`. The preload runs once per Bun process, including
// child Bun processes alchemy spawns for the embedded Vite.

import { Socket as NetSocket } from 'node:net';
import { TLSSocket } from 'node:tls';

const patch = (proto: object) => {
  if (typeof (proto as { destroySoon?: () => void }).destroySoon === 'function') {
    return;
  }
  (proto as { destroySoon: () => void }).destroySoon = function destroySoon(
    this: { end?: () => void; destroy?: () => void },
  ) {
    if (typeof this.end === 'function') {
      this.end();
    } else if (typeof this.destroy === 'function') {
      this.destroy();
    }
  };
};

patch(NetSocket.prototype);
patch(TLSSocket.prototype);
