import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { siteUrl } from "@/lib/site-url";

const DESCRIPTION =
  "Turn a gut feeling about yourself into a small experiment, and get a verdict from your own data.";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "Hunch",
    template: "%s · hunch",
  },
  description: DESCRIPTION,
  // The image comes from app/opengraph-image.tsx; Next fills it in for both.
  openGraph: {
    type: "website",
    siteName: "Hunch",
    title: "Hunch — got a hunch? Prove it.",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Hunch — got a hunch? Prove it.",
    description: DESCRIPTION,
  },
};

/**
 * `dark` is on <html> because the app has one theme and the `dark:` variants
 * shadcn components ship with are scoped to `&:is(.dark *)`. The palette itself
 * lives on `:root` in globals.css, so `body` is painted before any component
 * mounts — no white flash behind a black app.
 *
 * The brand faces are self-hosted through @font-face in globals.css, so there
 * is no next/font call here and no runtime request to a font host.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        {/* One toaster for the app, mounted once at the root: a security
            change or a saved draft says so wherever it happens. */}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
