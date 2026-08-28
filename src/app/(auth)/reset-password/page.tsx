import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/password-reset-form";

export const metadata: Metadata = {
  title: "New password · hunch",
};

/** Better Auth puts the single-use token on the query string of the emailed link. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;
  return <ResetPasswordForm token={value ?? null} />;
}
