"use client";

import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { twoFactor, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * The ten one-time codes, with a way to actually keep them.
 *
 * They used to render as bare text, shown exactly once, above a "Done" button
 * that discarded them for good — no copy, no download, no confirmation. The
 * realistic outcome was that nobody saved them, which turns a lost inbox into a
 * permanently locked account.
 */
function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const asText = [
    "Hunch backup codes",
    "Each code works once, in place of an emailed sign-in code.",
    "",
    ...codes,
    "",
  ].join("\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) — the download
      // and the on-screen codes are both still there.
      setCopied(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([asText], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hunch-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p className="mt-0 mb-1.5 text-sm leading-relaxed text-ink">
        Two-factor is on. From now on we&apos;ll email a code at sign-in.
      </p>
      <p className="mt-0 mb-4 text-xs leading-relaxed text-muted-foreground">
        Save these somewhere safe — each works once if you can&apos;t get the email.
        You won&apos;t see them again.
      </p>

      <div className="grid max-w-[320px] grid-cols-2 gap-x-5 gap-y-1.5 font-mono text-sm text-ink">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>

      <div className="mt-[18px] flex flex-wrap gap-2.5">
        <Button type="button" variant="brand" size="touch" onClick={copyAll} className={SECONDARY}>
          {copied ? (
            <>
              <CheckIcon aria-hidden className="mr-1.5 inline-block size-(--icon) align-[-0.15em]" />
              Copied
            </>
          ) : (
            "Copy all"
          )}
        </Button>
        <Button type="button" variant="brand" size="touch" onClick={download} className={SECONDARY}>
          Download .txt
        </Button>
      </div>

      <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-2.5 text-xs text-ink">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="size-4 accent-s1"
        />
        I&apos;ve saved these somewhere safe
      </label>

      <Button
        type="button"
        variant="brand"
        size="touch"
        disabled={!saved}
        onClick={onDone}
        className={cn(PRIMARY, "mt-4")}
      >
        Done
      </Button>
    </div>
  );
}

const LABEL_CLASS = "text-xs uppercase tracking-[0.16em] text-muted-foreground";

/** The quiet, outlined action — copy, download, keep it on. */
const SECONDARY = "border-rule font-bold";

/** The filled one. */
const PRIMARY = "border-ink bg-ink font-bold text-paper";

export function SecuritySettings() {
  const { data: session, refetch } = useSession();
  const enabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );

  const [password, setPassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Turning 2FA off is a security downgrade, so it asks before it lands and
  // says so afterwards — it used to do neither, just re-rendering in the other
  // state with no acknowledgement that anything had changed.
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onEnable(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setError(null);
    setBusy(true);
    const res = await twoFactor.enable({ password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't turn it on. Check your password.");
      return;
    }
    setBackupCodes(res.data.backupCodes);
    setPassword("");
    setNotice(null);
    refetch?.();
  }

  async function onDisable(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setError(null);
    setBusy(true);
    const res = await twoFactor.disable({ password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't turn it off. Check your password.");
      return;
    }
    setPassword("");
    setBackupCodes(null);
    setConfirmingOff(false);
    setNotice("Two-factor is off. Sign-in now needs only your password.");
    refetch?.();
  }

  return (
    <div className="max-w-[560px]">
      <h1 className="mt-0 mb-2 font-heading text-[clamp(28px,4vw,42px)] font-bold tracking-[-0.02em] text-ink">
        Security
      </h1>
      <p className="mt-0 mb-[clamp(24px,4vh,40px)] text-sm text-muted-foreground">
        Add a second step at sign-in — we email you a code each time.
      </p>

      <div className="rounded-lg border border-rule border-t-2 border-t-transparent bg-card p-[clamp(24px,3vw,36px)] [border-image:linear-gradient(90deg,var(--s1),var(--s2))_1]">
        <h2
          className={cn(
            "mt-0 mb-3.5 text-xs font-normal tracking-[0.2em] uppercase",
            enabled ? "text-good" : "text-muted-foreground",
          )}
        >
          Two-factor by email · {enabled ? "On" : "Off"}
        </h2>

        {notice && (
          <p role="status" className="mt-0 mb-4 text-xs leading-relaxed text-good">
            {notice}
          </p>
        )}

        {/* Just enabled — show backup codes to save */}
        {backupCodes ? (
          <BackupCodes codes={backupCodes} onDone={() => setBackupCodes(null)} />
        ) : enabled ? (
          /* Enabled: offer disable */
          <form onSubmit={onDisable}>
            <p className="mt-0 mb-4 text-sm leading-relaxed text-muted-foreground">
              We email a code at every sign-in. Enter your password to turn this
              off.
            </p>
            <Field className="max-w-[320px]">
              <FieldLabel htmlFor="pw-off" className={LABEL_CLASS}>
                Password
              </FieldLabel>
              <Input
                id="pw-off"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
            </Field>
            {error && (
              <p role="alert" className="mt-2.5 mb-0 text-xs text-s1">
                {error}
              </p>
            )}

            {confirmingOff ? (
              <div className="mt-4">
                <p className="mt-0 mb-3 text-sm leading-relaxed text-ink">
                  Without email codes, your password is the only thing standing
                  between someone and your account. Your backup codes stop working too.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Button
                    type="submit"
                    variant="brand"
                    size="touch"
                    disabled={busy}
                    className="border-s1 bg-s1 font-bold text-paper hover:bg-s1"
                  >
                    {busy ? "Turning off…" : "Yes, turn it off"}
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="touch"
                    onClick={() => setConfirmingOff(false)}
                    className={SECONDARY}
                  >
                    Keep it on
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="brand"
                size="touch"
                disabled={busy || !password}
                onClick={() => setConfirmingOff(true)}
                className="mt-4 border-ink font-bold"
              >
                Turn off
              </Button>
            )}
          </form>
        ) : (
          /* Disabled: enable */
          <form onSubmit={onEnable}>
            <p className="mt-0 mb-4 text-sm leading-relaxed text-muted-foreground">
              Confirm your password to switch on email codes at sign-in.
            </p>
            <Field className="max-w-[320px]">
              <FieldLabel htmlFor="pw-on" className={LABEL_CLASS}>
                Password
              </FieldLabel>
              <Input
                id="pw-on"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
            </Field>
            {error && (
              <p role="alert" className="mt-2.5 mb-0 text-xs text-s1">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="brand"
              size="touch"
              disabled={busy}
              className={cn(PRIMARY, "mt-4")}
            >
              {busy ? "Turning on…" : "Turn on email codes"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
