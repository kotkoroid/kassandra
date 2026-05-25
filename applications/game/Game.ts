import { AlchemyContext } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

// Production custom hostname for the game app. The realm + gateway
// live one DNS label deeper (realm.<host>, api.<host>) so the same
// session cookie scoped to .<host> travels to all three. Alchemy's
// local dev provider ignores `domain:` and serves under
// http://game.localhost:<port>.
//
// Duplicated (for now) in Gateway.ts and Realm.ts; the broader
// dedup of PROD_APP_HOST into a shared deployment-constants module
// is tracked separately.
const PROD_APP_HOST = 'kassandra.kotkoroid.com';
const PROD_URL = `https://${PROD_APP_HOST}`;

export interface GameEnv {
  readonly VITE_GATEWAY_URL: string;
  readonly VITE_REALM_URL: string;
}

/**
 * Game application resource — Vite-built Svelte/Threlte client.
 *
 * Mirrors the shape of `Gateway` and `Realm`: yields the underlying
 * alchemy resource, then resolves `.url` to the correct value for
 * the current alchemy mode (dev → workers.dev / localhost; deploy →
 * the custom hostname). The stack file reads `.url` and never has
 * to know which mode it is in.
 *
 * `Cloudflare.Vite` is not a class builder like `Cloudflare.Worker`,
 * so we expose a factory the stack can call with cross-resource env
 * wiring — the Gateway/Realm URLs are only known at stack-compose
 * time.
 */
export default function Game(env: GameEnv) {
  return Effect.gen(function* () {
    const { dev } = yield* AlchemyContext;
    const vite = yield* Cloudflare.Vite('Game', {
      rootDir: './applications/game',
      compatibility: {
        flags: ['nodejs_compat'],
      },
      domain: PROD_APP_HOST,
      env: {
        VITE_GATEWAY_URL: env.VITE_GATEWAY_URL,
        VITE_REALM_URL: env.VITE_REALM_URL,
      },
    });
    return { url: dev ? vite.url : PROD_URL };
  });
}
