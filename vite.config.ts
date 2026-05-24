import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

export default defineConfig({
  fmt: {
    singleQuote: true,
  },
  test: {
    projects: [
      {
        test: {
          name: "simulation",
          include: ["libraries/domain/simulation/src/**/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
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
