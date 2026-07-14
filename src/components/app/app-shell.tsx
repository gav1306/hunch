"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth-client";
import { GRAIN_SVG, PALETTES } from "@/components/landing/palette";

const DARK = {
  paper: "#0E0D12",
  ink: "#F2ECDD",
  muted: "#8C8676",
  rule: "rgba(242,236,221,0.16)",
};
const P = PALETTES.Riso;

export type SessionUser = { name: string; email: string };

function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account"
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "1px solid var(--rule)",
          background: "color-mix(in srgb, var(--paper) 84%, var(--ink))",
          color: "var(--ink)",
          cursor: "pointer",
          fontFamily: "'Clash Display',sans-serif",
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {initial}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            minWidth: 200,
            zIndex: 30,
            background: "color-mix(in srgb, var(--paper) 92%, var(--ink))",
            border: "1px solid var(--rule)",
            boxShadow: "0 24px 50px -20px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--rule)" }}>
            <div style={{ fontSize: 13, color: "var(--ink)" }}>{user.name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
              {user.email}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="app-menu-item"
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "12px 16px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--ink)",
              fontFamily: "'Space Mono',monospace",
              fontSize: 12,
              letterSpacing: "0.06em",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div
      className="app-shell"
      style={
        {
          minHeight: "100vh",
          width: "100%",
          background: DARK.paper,
          color: DARK.ink,
          fontFamily: "'Space Mono',ui-monospace,monospace",
          "--paper": DARK.paper,
          "--ink": DARK.ink,
          "--muted": DARK.muted,
          "--rule": DARK.rule,
          "--s1": P.s1,
          "--s2": P.s2,
        } as React.CSSProperties
      }
    >
      <style>{`
        .app-shell a{color:inherit;}
        .app-newhunch{transition:background 200ms ease,color 200ms ease;}
        .app-newhunch:hover{background:var(--s1);color:var(--paper);border-color:var(--s1);}
        .app-menu-item:hover{background:color-mix(in srgb,var(--paper) 80%,var(--s1));}
        .app-card{transition:border-color 240ms ease,background 240ms ease;}
        .app-card:hover{border-color:var(--ink);}
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          opacity: 0.05,
          mixBlendMode: "soft-light",
          backgroundImage: GRAIN_SVG,
        }}
      />

      {/* header */}
      <header
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "clamp(18px,2.4vw,26px) clamp(20px,4vw,52px)",
          borderBottom: "1px solid var(--rule)",
        }}
      >
        <Link
          href="/home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            textDecoration: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/starburst.png" alt="" width={22} height={22} />
          <span
            style={{
              fontFamily: "'Clash Display',sans-serif",
              fontWeight: 600,
              fontSize: 20,
              letterSpacing: "-0.01em",
            }}
          >
            hunch
          </span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "clamp(12px,2vw,20px)" }}>
          <Link
            href="/hunch/new"
            className="app-newhunch"
            style={{
              padding: "9px 16px",
              border: "1px solid var(--ink)",
              fontSize: 11.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            + New hunch
          </Link>
          <AccountMenu user={user} />
        </div>
      </header>

      <main
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1080,
          margin: "0 auto",
          padding: "clamp(32px,6vh,64px) clamp(20px,4vw,52px) clamp(60px,10vh,110px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
