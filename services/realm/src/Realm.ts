import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest';
import PartyRoom from './PartyRoom.ts';
import PlayerProfile from './PlayerProfile.ts';

// Realm Worker — entry point for all game-server traffic.
//
// Routing:
//   GET /parties/:id/ws?upgrade=websocket  → PartyRoom DO (game session)
//   *                                      → 404
//
// The gateway Worker (Phase 5) sits in front and issues JWTs before
// forwarding WebSocket upgrades here.

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
    yield* PlayerProfile; // bind the namespace so CF registers the DO class

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url);

        // WebSocket upgrade for a party session.
        // Path: /parties/:partyId/ws
        const wsMatch = url.pathname.match(/^\/parties\/([^/]+)\/ws$/);
        if (wsMatch) {
          const upgradeHeader = request.headers['upgrade'];
          if (upgradeHeader?.toLowerCase() !== 'websocket') {
            return HttpServerResponse.text('Expected WebSocket upgrade', { status: 426 });
          }
          const partyId = wsMatch[1]!;
          const room = rooms.getByName(partyId);
          return yield* room.fetch(request);
        }

        return HttpServerResponse.text('Not Found', { status: 404 });
      }),
    };
  }),
) {}
