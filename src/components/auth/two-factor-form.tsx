"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { twoFactor } from "@/lib/auth-client";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

/** Uppercase mono, at the 12px readable floor rather than the old 10.5px. */
const LABEL_CLASS = "text-xs uppercase tracking-[0.16em] text-muted-foreground";

/**
 * Resend and "use a backup code" read as links but are buttons, and were 12.5px
 * of text with no padding — the two controls a locked-out user needs most.
 */
const LINK_BTN =
  "border-transparent px-1 font-mono text-xs normal-case tracking-normal text-muted-foreground hover:border-transparent hover:bg-transparent hover:text-s1";

export function TwoFactorForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  // Off by default. This is a security decision, and the screen it's on may
  // well be a borrowed machine — the user opts in, we don't opt in for them.
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const sentOnce = useRef(false);
  // Resend had no cooldown and no feedback beyond the paragraph above flicking
  // back, so the only way to tell it had worked was to have been watching.
  const [cooldown, setCooldown] = useState(0);

  // Email the code as soon as the user lands here.
  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    twoFactor.sendOtp().then((res) => {
      if (res.error) {
        setError(res.error.message ?? "Couldn't send your code.");
        return;
      }
      setSent(true);
      // A code has just gone out, so the cooldown starts here too — otherwise
      // "resend" is available the instant the page loads.
      setCooldown(30);
    });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0) return;
    setError(null);
    setSent(false);
    const res = await twoFactor.sendOtp();
    if (res.error) {
      setError(res.error.message ?? "Couldn't resend your code.");
      return;
    }
    setSent(true);
    setCooldown(30);
  }

  const [touched, setTouched] = useState(false);
  const problem = backup
    ? code.trim().length > 0
      ? null
      : "Enter one of the backup codes you saved."
    : code.trim().length === 6
      ? null
      : "The emailed code is 6 digits.";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    // Enabled while the code is short: pressing it says what's missing rather
    // than sitting there greyed out.
    if (problem) {
      setTouched(true);
      document.getElementById("code")?.focus();
      return;
    }
    setError(null);
    setLoading(true);

    const res = backup
      ? await twoFactor.verifyBackupCode({ code: code.trim() })
      : await twoFactor.verifyOtp({ code: code.trim(), trustDevice: trust });

    if (res.error) {
      setLoading(false);
      setError(res.error.message ?? "That code didn't work. Try again.");
      return;
    }
    router.push("/home");
    router.refresh();
  }

  return (
    <div>
      <p className="mt-0 mb-3.5 text-xs tracking-[0.24em] text-muted-foreground uppercase">
        <span aria-hidden className="text-s1">
          ✦
        </span>{" "}
        Security check
      </p>

      <h1 className="mt-0 mb-2.5 font-heading text-[clamp(30px,4vw,44px)] leading-none font-bold tracking-[-0.02em] text-ink">
        Two-factor
      </h1>
      <p className="mt-0 mb-7 text-sm leading-relaxed text-muted-foreground">
        {backup
          ? "Enter one of your saved backup codes."
          : sent
            ? "We emailed you a 6-digit code. Enter it below."
            : "Sending a 6-digit code to your email…"}
      </p>

      <form onSubmit={onSubmit} noValidate>
        <Field data-invalid={touched && problem ? true : undefined}>
          <FieldLabel htmlFor="code" className={LABEL_CLASS}>
            {backup ? "Backup code" : "Email code"}
          </FieldLabel>
          <Input
            id="code"
            type="text"
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            value={code}
            aria-invalid={touched && problem ? true : undefined}
            onChange={(e) => {
              setCode(backup ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6));
              setTouched(false);
            }}
            onBlur={() => setTouched(true)}
            placeholder={backup ? "xxxxxxxxxx" : "000000"}
            autoFocus
            className="font-mono text-lg tracking-[0.3em]"
          />
          <FieldError className="text-xs">{touched ? problem : null}</FieldError>
        </Field>

        {!backup && (
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={trust}
              onChange={(e) => setTrust(e.target.checked)}
              className="size-4 accent-s1"
            />
            Trust this device for 30 days
          </label>
        )}

        {error && (
          <div role="alert" className="mt-3 text-xs text-s1">
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="brand"
          size="touch"
          disabled={loading}
          className="auth-submit mt-5 w-full border-none bg-ink py-4 text-[13px] tracking-[0.14em] text-paper"
        >
          {loading ? "Verifying…" : "Verify"}
          {!loading && <ArrowRightIcon data-icon="inline-end" aria-hidden />}
        </Button>
      </form>

      <div className="mt-6 flex flex-wrap gap-[18px]">
        {!backup && (
          <Button
            type="button"
            variant="brand"
            size="touch"
            onClick={resend}
            disabled={cooldown > 0}
            className={LINK_BTN}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Button>
        )}
        <Button
          type="button"
          variant="brand"
          size="touch"
          onClick={() => {
            setBackup((v) => !v);
            setCode("");
            setError(null);
          }}
          className={LINK_BTN}
        >
          {backup ? (
            <>
              <ArrowLeftIcon aria-hidden className="mr-1 inline-block size-(--icon) align-[-0.15em]" />
              Use email code
            </>
          ) : (
            "Use a backup code instead"
          )}
        </Button>
      </div>
    </div>
  );
}

