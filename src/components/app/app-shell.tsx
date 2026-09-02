"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOutIcon, PlusIcon, ShieldIcon } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SessionUser = { name: string; email: string };

/**
 * The account menu.
 *
 * It used to be a `useState` boolean and a document `mousedown` listener: no
 * Escape, no arrow keys, no `aria-expanded`, no focus return, and a div of
 * links with no menu semantics. On DropdownMenu all of that is Base UI's
 * problem, and it gets solved the same way everywhere the menu appears.
 */
function AccountMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon-touch"
            aria-label="Account"
            className="rounded-full border-rule font-heading text-base font-semibold"
          />
        }
      >
        {initial}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 min-w-56">
        {/* The label names the group it sits in — Base UI throws outright if a
            GroupLabel is rendered outside a Group, which is what a stray
            identity header at the top of this menu was doing. Inside, it reads
            as "Dev, dev@example.com: Security, Sign out". */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">{user.name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="h-11 gap-2 px-2.5 font-mono text-xs tracking-[0.06em]"
            render={<Link href="/security" />}
          >
            <ShieldIcon />
            Security
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-11 gap-2 px-2.5 font-mono text-xs tracking-[0.06em]"
            onClick={handleSignOut}
          >
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The authed frame.
 *
 * `slim` is the same header over a 640px column — the width the dashboard,
 * protocol and new-hunch screens already lay themselves out at. They used to
 * draw their own `<main>` and offer a 10.5px "← home" link as the entire
 * navigation, which meant three screens where signing out was unreachable
 * without first guessing your way back to home.
 */
export function AppShell({
  user,
  children,
  variant = "default",
}: {
  user: SessionUser;
  children: React.ReactNode;
  variant?: "default" | "slim";
}) {
  const slim = variant === "slim";

  return (
    <div className="app-shell min-h-dvh w-full bg-paper font-mono text-ink">
      <style>{`
        .app-shell a{color:inherit;}
        .app-card{transition:border-color 240ms ease,background 240ms ease,transform 240ms ease,box-shadow 240ms ease;}
        .app-card:hover{border-color:var(--ink);transform:translateY(-2px);box-shadow:0 8px 28px -14px color-mix(in srgb,var(--ink) 45%,transparent);}
        @media (prefers-reduced-motion: reduce){.app-card:hover{transform:none;}}
      `}</style>

      <div aria-hidden className="grain-overlay z-0" />

      <header className="relative z-1 flex items-center justify-between gap-4 border-b border-rule px-[clamp(20px,4vw,52px)] py-[clamp(14px,2.4vw,22px)]">
        <Link href="/home" className="inline-flex items-center gap-2 no-underline">
          <Image src="/starburst.png" alt="" width={22} height={22} aria-hidden />
          <span className="font-heading text-lg font-semibold tracking-[-0.01em]">
            hun<span className="text-s1">ch</span>
          </span>
        </Link>

        <div className="flex items-center gap-[clamp(10px,2vw,18px)]">
          <Button
            variant="brand"
            size="touch"
            className="rounded-none"
            render={<Link href="/hunch/new" />}
          >
            <PlusIcon data-icon="inline-start" />
            New hunch
          </Button>
          <AccountMenu user={user} />
        </div>
      </header>

      <main
        className={
          slim
            ? "relative z-1 mx-auto w-full max-w-160 px-5 pt-[clamp(24px,5vh,44px)] pb-24"
            : "relative z-1 mx-auto w-full max-w-270 px-[clamp(20px,4vw,52px)] pt-[clamp(32px,6vh,64px)] pb-[clamp(60px,10vh,110px)]"
        }
      >
        {children}
      </main>
    </div>
  );
}
