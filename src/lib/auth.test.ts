import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => {}) }));

/** auth.ts reads env at import, so each case gets a fresh module. */
async function loadAuth() {
  vi.resetModules();
  return (await import("@/lib/auth")).auth;
}

describe("auth options", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps rate-limit counts in the database, shared by every serverless instance", async () => {
    const auth = await loadAuth();
    expect(auth.options.rateLimit).toMatchObject({ enabled: true, storage: "database" });
  });

  it("sends a verification link at sign-up without blocking sign-in", async () => {
    const auth = await loadAuth();
    expect(auth.options.emailVerification?.sendOnSignUp).toBe(true);
    const password = auth.options.emailAndPassword as { requireEmailVerification?: boolean };
    expect(password.requireEmailVerification).toBeFalsy();

    const { sendEmail } = await import("@/lib/email");
    await auth.options.emailVerification!.sendVerificationEmail!(
      { user: { email: "a@b.test" }, url: "https://x/verify?t=1", token: "1" } as never,
    );
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ to: "a@b.test" });
    expect(vi.mocked(sendEmail).mock.calls[0][0].text).toContain("https://x/verify?t=1");
  });

  it("trusts localhost only outside production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await loadAuth()).options.trustedOrigins).not.toContain("http://localhost:3000");

    vi.stubEnv("NODE_ENV", "development");
    expect((await loadAuth()).options.trustedOrigins).toContain("http://localhost:3000");
  });
});
