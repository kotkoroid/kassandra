import { PROD_APP_HOST } from '@kassandra/effect-conventions-foundation-library';
import type { Input } from 'alchemy/Input';
import * as Cloudflare from 'alchemy/Cloudflare';

// URLs flow in as `Output<string>` from `alchemy.run.ts` (alchemy
// doesn't know the deployed Worker's domain until after the resource
// is created). `Input<string>` accepts both plain strings and Outputs.
export interface GameEnv {
  readonly VITE_GATEWAY_URL: Input<string>;
  readonly VITE_REALM_URL: Input<string>;
}

/**
 * Game application resource — Vite-built Svelte/Threlte client.
 *
 * Factory function (matches the function-form usage). Does NOT import
 * `AlchemyContext` — would otherwise get bundled into runtime.
 */
export default function Game(env: GameEnv) {
  return Cloudflare.Vite('Game', {
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
}
