import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { isGoogleConfigured } from "@/lib/auth-providers";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignUpPage() {
  return <AuthForm mode="signup" google={isGoogleConfigured()} />;
}
