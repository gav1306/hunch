import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { isGoogleConfigured } from "@/lib/auth-providers";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return <AuthForm mode="signin" google={isGoogleConfigured()} />;
}
