import { defineConfig, devices } from "@playwright/test";

// E2E contra o STAGING (nunca produção). Envs: NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, VALIDADOR_URL e
// VALIDADOR_TOKEN (validador local: python -m pytime_worker.validador).
const porta = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${porta}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // sandbox local da sessão: Chromium pré-instalado fora do cache padrão
    ...(process.env.PLAYWRIGHT_CHROMIUM
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM } }
      : {}),
  },
  webServer: {
    command: `npm run build && npx next start -p ${porta}`,
    url: `http://localhost:${porta}/login`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
