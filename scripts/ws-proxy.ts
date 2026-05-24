// Dev-only WebSocket pass-through proxy.
//
// Why: `alchemy dev` mangles browser WebSocket upgrades through its
// local-subdomain forwarder (see github.com/kotkoroid/alchemy-ws-repro).
// Vite's `/realm` proxy is the documented workaround but breaks
// browser→workerd subdomain upgrades. This script is a plain Bun WS
// bridge that takes HTTP + WS traffic on a chosen local port and
// forwards bytes-for-bytes to `realm.localhost:1337` (or any target).
//
// PR-G5: forwards the inbound `Cookie` header on the upstream WS open
// so the session cookie set by the gateway reaches the realm. Browsers
// attach the cookie to the upgrade request automatically (cookies
// are host-scoped, port-agnostic — `localhost:5173` setting the
// cookie means it travels to `localhost:5555` too); the proxy just
// has to pipe it through to the upstream.
//
// Usage:
//   Terminal 1: bun run dev                    # alchemy dev
//   Terminal 2: cd applications/game && bun vite  # standalone Vite for HMR
//   Terminal 3: bun scripts/ws-proxy.ts         # this proxy on :5555
//
// Then either:
//   (a) point Vite's `/realm` proxy at `localhost:5555` instead of
//       `realm.localhost:1337` (one-line edit in vite.config.ts), or
//   (b) point the client WS URL at `ws://localhost:5555/...` directly
//       in the `import.meta.env.DEV` branch of realm-client.ts and
//       profile-client.ts.
//
// Tradeoffs:
//   - Bun's WS server + WS client are both battle-tested for
//     subprotocols and arbitrary headers, unlike Vite's `http-proxy`
//     handoff to workerd subdomain WS upgrades.
//   - Zero dependence on alchemy local infra: this proxy only needs
//     `realm.localhost:1337` reachable (which `alchemy dev` provides).
//   - Production path unaffected — this script runs only in dev.

const PORT = Number(Bun.env.WS_PROXY_PORT ?? 5555);
const TARGET_HOST = Bun.env.WS_PROXY_TARGET ?? 'realm.localhost:1337';
const TARGET_HTTP = `http://${TARGET_HOST}`;
const TARGET_WS = `ws://${TARGET_HOST}`;

interface BridgeData {
  upstream: WebSocket;
  // Buffer client→upstream messages that arrive before the upstream
  // socket finishes its own open handshake. Drained on upstream open.
  pending: Array<string | Buffer | Uint8Array>;
}

const log = (kind: string, msg: string) =>
  console.log(`[ws-proxy ${kind}]`, msg);

const server = Bun.serve<BridgeData, undefined>({
  port: PORT,
  hostname: '0.0.0.0',

  // HTTP path: pass-through fetch. Used for everything that isn't a
  // WebSocket upgrade — e.g. a `curl` health-check.
  async fetch(req, server) {
    const url = new URL(req.url);
    const targetUrl = `${TARGET_HTTP}${url.pathname}${url.search}`;

    // Try to upgrade first. Bun's server.upgrade returns true if the
    // request is a WS upgrade; we then attach client + upstream WS
    // pairing in the websocket.open hook below.
    if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      // Capture the subprotocols + the upstream URL on the upgrade
      // attempt so `open` can wire the upstream WS.
      const protocols = req.headers.get('sec-websocket-protocol');
      const cookie = req.headers.get('cookie');
      const origin = req.headers.get('origin');
      const targetWsUrl = `${TARGET_WS}${url.pathname}${url.search}`;
      // Bun's `WebSocket` constructor accepts a `headers` option (a
      // non-standard extension over the browser signature) so the
      // session cookie + origin reach the realm worker on the upstream
      // upgrade handshake — without this the realm sees no Cookie
      // header and rejects every dev connection with 401.
      const upstreamInit: {
        protocols?: ReadonlyArray<string>;
        headers?: Record<string, string>;
      } = {};
      if (protocols) {
        upstreamInit.protocols = protocols.split(',').map((s) => s.trim());
      }
      const upstreamHeaders: Record<string, string> = {};
      if (cookie) upstreamHeaders['cookie'] = cookie;
      if (origin) upstreamHeaders['origin'] = origin;
      if (Object.keys(upstreamHeaders).length > 0) {
        upstreamInit.headers = upstreamHeaders;
      }
      const upstream = new WebSocket(targetWsUrl, upstreamInit as ConstructorParameters<typeof WebSocket>[1]);
      const bridge: BridgeData = { upstream, pending: [] };
      // Tell Bun to upgrade with the chosen subprotocol (echo first one).
      const ok = server.upgrade(req, {
        data: bridge,
        headers: protocols
          ? { 'Sec-WebSocket-Protocol': protocols.split(',')[0]!.trim() }
          : undefined,
      });
      if (!ok) {
        upstream.close();
        return new Response('Upgrade failed', { status: 426 });
      }
      log('open', `→ ${targetWsUrl}`);
      return; // upgrade response sent
    }

    log('http', `${req.method} ${url.pathname}${url.search} → ${targetUrl}`);
    try {
      // Drop the inbound Host header — alchemy dev's local-subdomain
      // proxy reads Host to dispatch to the right worker, and Bun's
      // fetch will repopulate it from the target URL anyway. Forwarding
      // `Host: localhost:5555` would dump the request into the
      // catch-all "no worker matches" error.
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
    // Bun calls `open` after the upgrade-side socket is ready, but the
    // upstream WS we created in `fetch` is still mid-handshake. Wire
    // up both directions; buffer downstream→upstream messages until
    // upstream's open event fires.
    open(ws) {
      const { upstream } = ws.data;
      upstream.binaryType = 'arraybuffer';

      upstream.onopen = () => {
        log('upstream', 'open');
        for (const m of ws.data.pending) {
          try {
            upstream.send(m as any);
          } catch (e) {
            log('upstream-send', String(e));
          }
        }
        ws.data.pending = [];
      };
      upstream.onmessage = (ev) => {
        try {
          ws.send(ev.data as any);
        } catch (e) {
          log('client-send', String(e));
        }
      };
      upstream.onclose = (ev) => {
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
      if (upstream.readyState === WebSocket.OPEN) {
        try {
          upstream.send(message as any);
        } catch (e) {
          log('upstream-send', String(e));
        }
      } else {
        // Buffer until upstream opens.
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

log('listen', `http+ws on http://localhost:${server.port} → ${TARGET_HTTP}`);
