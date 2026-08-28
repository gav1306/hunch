import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Hunch",
  description: "A copilot for n-of-1 experiments on yourself.",
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
