import "server-only";
import nodemailer from "nodemailer";

type Email = { to: string; subject: string; text: string };

/** Parse `EMAIL_FROM` ("Name <addr@x>" or "addr@x") into name + address. */
function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*(.*?)\s*<\s*(.+?)\s*>\s*$/);
  if (m) return { name: m[1] || "Hunch", email: m[2] };
  return { name: "Hunch", email: raw.trim() };
}

/**
 * Provider-agnostic email send, resolved in priority order:
 *   1. Gmail   — if GMAIL_USER and GMAIL_APP_PASSWORD are set. Free, reaches any
 *                inbox, no domain needed. First, because a Resend key still on
 *                the shared test sender would otherwise win and reach no one.
 *   2. Resend  — if RESEND_API_KEY is set. With no verified domain, the shared
 *                `onboarding@resend.dev` sender delivers ONLY to your own Resend
 *                account email; a verified domain lifts that to any recipient.
 *   3. Console — otherwise, so flows work in local dev with no account. Never
 *                in production: there it throws instead.
 * Swap or add providers by changing only this file.
 */
export async function sendEmail({ to, subject, text }: Email): Promise<void> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPassword) {
    return sendViaGmail({ to, subject, text }, gmailUser, gmailPassword);
  }

  const from = parseFrom(process.env.EMAIL_FROM ?? "Hunch <onboarding@resend.dev>");
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to, subject, text }),
    });
    if (!res.ok) {
      console.error(`[email] Resend send failed (${res.status}): ${await res.text()}`);
      throw new Error("Could not send email.");
    }
    return;
  }

  // These bodies carry 2FA codes and password-reset links. Written to a
  // production log, they hand any account to anyone who can read the logs.
  if (process.env.NODE_ENV === "production") {
    console.error(`[email] not sent: no email provider is configured (subject: ${subject})`);
    throw new Error("Email is not configured.");
  }

  console.log(
    `\n[email:dev] (no RESEND_API_KEY — logging instead of sending)\n  to: ${to}\n  subject: ${subject}\n  ${text}\n`,
  );
}

let gmailTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

/**
 * Send from a personal Gmail account over SMTP, signed in with an app password
 * (Google account > Security > 2-Step Verification > App passwords).
 *
 * The free way to reach any inbox without owning a domain. Gmail allows about
 * 500 recipients a day and rewrites the sender to the account itself, so the
 * from-address is always GMAIL_USER whatever EMAIL_FROM says.
 */
async function sendViaGmail(
  { to, subject, text }: Email,
  user: string,
  pass: string,
): Promise<void> {
  gmailTransport ??= nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  try {
    await gmailTransport.sendMail({ from: `Hunch <${user}>`, to, subject, text });
  } catch (err) {
    // Log why, never what: the body may be a sign-in code or a reset link.
    console.error(`[email] Gmail send failed (subject: ${subject}):`, (err as Error).message);
    throw new Error("Could not send email.");
  }
}
