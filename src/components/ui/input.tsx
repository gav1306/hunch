import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

/**
 * The text input every screen shares.
 *
 * Two deviations from the registry default, both from the audit:
 *
 * - **44px tall, not 32.** Every input in this app is something a thumb aims
 *   at on a phone. `h-8` is a pointer-sized control.
 * - **16px on small screens.** Safari zooms the page when a focused field is
 *   under 16px, which is what the app's 14px fields were doing. Hunch's
 *   `--text-base` is 15px, so the floor is set explicitly here rather than
 *   inherited; from `md:` up it drops to the scale's `sm`.
 *
 * The focus ring comes from `focus-visible:ring-ring` — this is the primitive
 * that retires the `outline: none` the auth fields used to set inline.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-input bg-transparent px-3 py-1 text-[16px] transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
