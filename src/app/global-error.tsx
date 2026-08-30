"use client";

import "./globals.css";
import { Boundary, HomeLink } from "@/components/app/boundary";

export default function GlobalError() {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full">
        <Boundary
          eyebrow="Something broke"
          title="The app failed to start."
          body="This one is ours. Reload the page — if it keeps happening, your data is safe and waiting."
          action={<HomeLink />}
        />
      </body>
    </html>
  );
}
