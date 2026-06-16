// Tests that drive a real federation join (signet consensus download) need far
// longer than the per-test default in playwright.config.ts.
export const E2E_LONG_TIMEOUT = 300_000
