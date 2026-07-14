import "server-only";

type Email = { to: string; subject: string; text: string };

/**
 * Provider-agnostic email send. Uses Resend when `RESEND_API_KEY` is set;
 * otherwise logs to the server console so flows work in local dev with no
 * account. Swap providers by changing only this file.
 */
export async function sendEmail({ to, subject, text }: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Hunch <onboarding@resend.dev>";

  if (!key) {
    console.log(
      `\n[email:dev] (no RESEND_API_KEY — logging instead of sending)\n  to: ${to}\n  subject: ${subject}\n  ${text}\n`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[email] send failed (${res.status}): ${body}`);
    throw new Error("Could not send email.");
  }
}
