import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendEmail } from "@/lib/email";

const mail = { to: "a@b.test", subject: "Your Hunch sign-in code", text: "Your code is 123456" };

describe("sendEmail without RESEND_API_KEY", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses in production instead of writing codes and reset links to the logs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendEmail(mail)).rejects.toThrow(/not configured/i);

    const logged = [...log.mock.calls, ...err.mock.calls].flat().join(" ");
    expect(logged).not.toContain("123456");
  });

  it("still prints to the console in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RESEND_API_KEY", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendEmail(mail);

    expect(log.mock.calls.flat().join(" ")).toContain("123456");
  });
});
