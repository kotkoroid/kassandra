import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import PartyRoom from './PartyRoom.ts';
import PlayerProfile from './PlayerProfile.ts';

// Realm Worker — entry point for all game-server traffic.
//
// Routing:
//   GET /parties/:partyId/ws?upgrade=websocket    → PartyRoom DO
//   GET /profiles/:accountId/rpc?upgrade=websocket → PlayerProfile DO (PR-G1)
//   *                                              → 404
//
// The gateway Worker (Phase 5) sits in front for non-game endpoints
// (party create) and will issue JWTs in PR-G2 before forwarding
// upgrades here.

export default class Realm extends Cloudflare.Worker<Realm>()(
  'Realm',
  {
    main: import.meta.path,
    compatibility: {
      flags: ['nodejs_compat'],
    },
  },
  Effect.gen(function* () {
    const rooms = yield* PartyRoom;
    const profiles = yield* PlayerProfile;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, 'http://localhost');
        const pathname = url.pathname;

        // WebSocket upgrade for a party session.
        // Path: /parties/:partyId/ws
        const wsMatch = pathname.match(/^\/parties\/([^/]+)\/ws$/);
        if (wsMatch) {
          const upgradeHeader = request.headers['upgrade'];
          if (upgradeHeader?.toLowerCase() !== 'websocket') {
            return HttpServerResponse.text('Expected WebSocket upgrade', { status: 426 });
          }
          const partyId = wsMatch[1]!;
          const room = rooms.getByName(partyId);
          return yield* room.fetch(request);
        }

        // PR-G1: PlayerProfile RPC upgrade.
        // Path: /profiles/:accountId/rpc
        // The DO sees the same URL we received, so it parses the
        // accountId from its own path component — no rewrite needed.
        // PR-G2 will replace this URL-trust model with JWT verification.
        const profileMatch = pathname.match(/^\/profiles\/([^/]+)\/rpc$/);
        if (profileMatch) {
          const upgradeHeader = request.headers['upgrade'];
          if (upgradeHeader?.toLowerCase() !== 'websocket') {
            return HttpServerResponse.text('Expected WebSocket upgrade', { status: 426 });
          }
          const accountId = profileMatch[1]!;
          const profile = profiles.getByName(accountId);
          return yield* profile.fetch(request);
        }

        return HttpServerResponse.text('Not Found', { status: 404 });
      }),
    };
  }),
) {}
