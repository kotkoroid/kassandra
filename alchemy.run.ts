import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import Game from "./applications/game/Game.ts";
import Gateway from "./orchestrators/gateway/src/Gateway.ts";
import Realm from "./services/realm/src/Realm.ts";

export default Alchemy.Stack(
  "Kassandra",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    // Worker - Gateway Orchestrator
    const gateway = yield* Gateway;

    // Worker - Realm Service
    const realm = yield* Realm;

    // Worker - Game Application
    const game = yield* Game({
      VITE_GATEWAY_URL: gateway.url,
      VITE_REALM_URL: realm.url,
    });

    return {
      gameUrl: game.url,
      gatewayUrl: gateway.url,
      realmUrl: realm.url,
    };
  }),
);
