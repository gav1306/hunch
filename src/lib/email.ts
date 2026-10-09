import "server-only";

type Email = { to: string; subject: string; text: string };

/** Parse `EMAIL_FROM` ("Name <addr@x>" or "addr@x") into name + address. */
function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*(.*?)\s*<\s*(.+?)\s*>\s*$/);
  if (m) return { name: m[1] || "Hunch", email: m[2] };
  return { name: "Hunch", email: raw.trim() };
}

/**
 * Provider-agnostic email send, resolved in priority order:
 *   1. Resend  — if RESEND_API_KEY is set. With no verified domain, the shared
 *                `onboarding@resend.dev` sender delivers ONLY to your own Resend
 *                account email; a verified domain lifts that to any recipient.
 *   2. Console — otherwise, so flows work in local dev with no account. Never
 *                in production: there it throws instead.
 * Swap or add providers by changing only this file.
 */
export async function sendEmail({ to, subject, text }: Email): Promise<void> {
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
    console.error(`[email] not sent: RESEND_API_KEY is not set (subject: ${subject})`);
    throw new Error("Email is not configured.");
  }

  console.log(
    `\n[email:dev] (no RESEND_API_KEY — logging instead of sending)\n  to: ${to}\n  subject: ${subject}\n  ${text}\n`,
  );
}
