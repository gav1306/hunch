import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: "m1" }));
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));

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

describe("sendEmail through Gmail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    sendMail.mockClear();
    createTransport.mockClear();
  });

  const gmail = () => {
    vi.stubEnv("GMAIL_USER", "hunch.app@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
  };

  it("sends from the Gmail account over SMTP when it's configured", async () => {
    gmail();
    vi.stubEnv("RESEND_API_KEY", "");

    await sendEmail(mail);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "gmail",
        auth: { user: "hunch.app@gmail.com", pass: "abcd efgh ijkl mnop" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Hunch <hunch.app@gmail.com>", ...mail }),
    );
  });

  it("takes precedence over a Resend key, whose test sender only reaches its owner", async () => {
    gmail();
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendEmail(mail);

    expect(sendMail).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails without logging the message when Gmail refuses", async () => {
    gmail();
    sendMail.mockRejectedValueOnce(new Error("535 bad credentials"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendEmail(mail)).rejects.toThrow(/could not send/i);
    expect(err.mock.calls.flat().join(" ")).not.toContain("123456");
  });
});
