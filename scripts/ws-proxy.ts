// Dev-only single-origin entry-point proxy.
//
// `alchemy dev` exposes each worker on its own `*.localhost:1337`
// subdomain. The local-subdomain proxy that alchemy uses to dispatch
// across those subdomains mishandles browser-issued WebSocket
// upgrades — the chain swallows `Sec-WebSocket-Extensions:
// permessage-deflate` (which curl never sends, browsers always do)
// and the 101 never makes it back. See
// github.com/kotkoroid/alchemy-ws-repro for the minimal reproduction
// (Bug #1: browser-only direct WS; Bug #2: WS through cross-subdomain
// forward). PR-G5 cookies + the destroySoon polyfill removed the
// other failure layers, but the underlying alchemy-WS forwarding
// path remains broken for browsers.
//
// Workaround shape: route ALL browser traffic through a single Bun
// process on `localhost:5555`. Bun's `Bun.serve` + `new WebSocket`
// pair handles WS upgrades cleanly (no permessage-deflate quirk),
// and we go server-to-server to each alchemy worker by exact
// hostname — bypassing alchemy's local-proxy entirely on the
// problematic hop.
//
//   browser → ws://localhost:5555/realm/profiles/:id/rpc
//     → Bun proxy opens new WS to ws://realm.localhost:1337/profiles/:id/rpc
//     → realm worker accepts, frames flow both ways
//
// Because the browser only ever sees `localhost:5555`, the session
// cookie that the gateway sets stays on that origin and attaches to
// every subsequent request — including the WS upgrade. No
// cross-origin cookie scoping, no SameSite quirks, no Vite proxy
// in the path.
//
// Usage:
//   Terminal 1: bun run dev                # alchemy: api/realm/game on *.localhost:1337
//   Terminal 2: bun scripts/ws-proxy.ts    # single entry on localhost:5555
//   Browser:    http://localhost:5555
//
// Routing table:
//   /api/*    → api.localhost:1337/*    (HTTP only; `/api` prefix stripped)
//   /realm/*  → realm.localhost:1337/*  (HTTP + WS; `/realm` prefix stripped)
//   /*        → game.localhost:1337/*   (HTTP fallthrough + Vite HMR WS; path passes through unchanged)

const PORT = Number(Bun.env['WS_PROXY_PORT'] ?? 5555);
const ALCHEMY_PORT = Number(Bun.env['WS_PROXY_ALCHEMY_PORT'] ?? 1337);

interface UpstreamRoute {
  /** Upstream `host:port` to fetch / open WS against. */
  readonly host: string;
  /** Rewrite the inbound URL path for the upstream. */
  readonly rewrite: (pathname: string) => string;
}

const stripPrefix = (prefix: string) => (path: string) =>
  path.startsWith(prefix) ? path.slice(prefix.length) || '/' : path;

const ROUTES: ReadonlyArray<{ prefix: string; route: UpstreamRoute }> = [
  {
    prefix: '/api/',
    route: {
      host: `api.localhost:${ALCHEMY_PORT}`,
      rewrite: stripPrefix('/api'),
    },
  },
  {
    prefix: '/realm/',
    route: {
      host: `realm.localhost:${ALCHEMY_PORT}`,
      rewrite: stripPrefix('/realm'),
    },
  },
];

// Default fallthrough: game worker (Vite SPA + HMR ws).
const FALLBACK: UpstreamRoute = {
  host: `game.localhost:${ALCHEMY_PORT}`,
  rewrite: (p) => p,
};

const resolveRoute = (pathname: string): UpstreamRoute => {
  for (const { prefix, route } of ROUTES) {
    if (pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)) {
      return route;
    }
  }
  return FALLBACK;
};

interface BridgeData {
  upstream: WebSocket;
  pending: Array<string | Buffer | Uint8Array>;
}

const log = (kind: string, msg: string) =>
  console.log(`[ws-proxy ${kind}]`, msg);

const server = Bun.serve<BridgeData, undefined>({
  port: PORT,
  hostname: '0.0.0.0',

  async fetch(req, server) {
    const url = new URL(req.url);
    const route = resolveRoute(url.pathname);
    const upstreamPath = route.rewrite(url.pathname) + url.search;

    // ---- WebSocket upgrade ------------------------------------
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const targetWsUrl = `ws://${route.host}${upstreamPath}`;
      // Forward Cookie + Origin so the realm's session lookup +
      // Origin allow-list both pass. permessage-deflate is dropped:
      // Bun's `new WebSocket()` doesn't request the extension by
      // default, so the upstream handshake is "clean" regardless of
      // what the browser asked for on its side.
      const upstreamHeaders: Record<string, string> = {};
      const cookie = req.headers.get('cookie');
      if (cookie) upstreamHeaders['cookie'] = cookie;
      const origin = req.headers.get('origin');
      if (origin) upstreamHeaders['origin'] = origin;
      const upstream = new WebSocket(targetWsUrl, { headers: upstreamHeaders });
      const bridge: BridgeData = { upstream, pending: [] };
      const ok = server.upgrade(req, { data: bridge });
      if (!ok) {
        upstream.close();
        return new Response('Upgrade failed', { status: 426 });
      }
      log('open', `→ ${targetWsUrl}`);
      return;
    }

    // ---- HTTP pass-through ------------------------------------
    const targetUrl = `http://${route.host}${upstreamPath}`;
    log('http', `${req.method} ${url.pathname}${url.search} → ${targetUrl}`);
    try {
      // Drop the inbound Host header — Bun's fetch will set the
      // correct one for the target URL, and forwarding the proxy's
      // own Host would land in alchemy's "no worker matches"
      // catch-all.
      const headers = new Headers(req.headers);
      headers.delete('host');
      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers,
        body:
          req.method === 'GET' || req.method === 'HEAD'
            ? undefined
            : await req.arrayBuffer(),
        redirect: 'manual',
      });
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: upstreamRes.headers,
      });
    } catch (err) {
      log('http-err', String(err));
      return new Response(`upstream fetch failed: ${String(err)}`, {
        status: 502,
      });
    }
  },

  websocket: {
    open(ws) {
      const { upstream } = ws.data;
      upstream.binaryType = 'arraybuffer';

      upstream.onopen = () => {
        log('upstream', 'open');
        for (const m of ws.data.pending) {
          try {
            upstream.send(m as ArrayBufferLike | string);
          } catch (e) {
            log('upstream-send', String(e));
          }
        }
        ws.data.pending = [];
      };
      upstream.onmessage = (ev: MessageEvent) => {
        try {
          // Log shape so we can see whether realm is responding at
          // all + whether frames are arriving as text or binary.
          const data = ev.data;
          const kind =
            typeof data === 'string'
              ? `text(${data.length})`
              : data instanceof ArrayBuffer
                ? `bin(${data.byteLength})`
                : `unk(${typeof data})`;
          log('upstream→client', kind);
          ws.send(data);
        } catch (e) {
          log('client-send', String(e));
        }
      };
      upstream.onclose = (ev: CloseEvent) => {
        log('upstream', `close ${ev.code} ${ev.reason}`);
        try {
          ws.close(ev.code === 1006 ? 1000 : ev.code, ev.reason);
        } catch {}
      };
      upstream.onerror = () => {
        log('upstream', 'error');
        try {
          ws.close(1011, 'upstream error');
        } catch {}
      };
    },

    message(ws, message) {
      const { upstream, pending } = ws.data;
      const kind =
        typeof message === 'string'
          ? `text(${message.length})`
          : `bin(${(message as Uint8Array).byteLength})`;
      log('client→upstream', kind);
      if (upstream.readyState === WebSocket.OPEN) {
        try {
          upstream.send(message as ArrayBufferLike | string);
        } catch (e) {
          log('upstream-send', String(e));
        }
      } else {
        log('client→upstream', 'buffering (upstream not open yet)');
        pending.push(message as string | Buffer | Uint8Array);
      }
    },

    close(ws, code, reason) {
      log('client', `close ${code} ${reason}`);
      try {
        ws.data.upstream.close(code === 1005 || code === 1006 ? 1000 : code, reason);
      } catch {}
    },
  },
});

log(
  'listen',
  `single-origin entry on http://localhost:${server.port}\n` +
    `  /api/*   → api.localhost:${ALCHEMY_PORT}\n` +
    `  /realm/* → realm.localhost:${ALCHEMY_PORT}\n` +
    `  /*       → game.localhost:${ALCHEMY_PORT}`,
);
