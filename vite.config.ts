import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    singleQuote: true,
  },
  test: {
    projects: [
      {
        test: {
          name: "simulation",
          include: ["applications/game/src/simulation/**/*.test.ts"],
          browser: {
            enabled: true,
            // TODO: Remove `never`: https://github.com/voidzero-dev/vite-plus/issues/1634
            provider: playwright() as never,
            instances: [{ browser: "chromium" }],
            headless: true,
          },
        },
      },
    ],
  },
  staged: {
    "*": "vp check --fix",
  },
});
