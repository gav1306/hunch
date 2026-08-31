"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "are you sure?" panels that replace their own trigger.
 *
 * Archive and Abandon both swap the button the user just pressed for a
 * paragraph and two new buttons. On a mouse that reads fine; on a keyboard the
 * focused element is removed from the document, so focus falls back to `body`
 * and the next Tab restarts from the top of the page — the reader is told
 * nothing about the question they just opened. This moves focus onto the panel
 * when it opens, hands it back to the trigger when the panel is dismissed, and
 * lets Escape close it the way every other cancel does.
 *
 * Focus only returns after an actual dismissal, so the panels that navigate
 * away on success don't fight the new screen for the caret.
 */
export function useConfirmPanel() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const dismiss = () => {
    restoreFocus.current = true;
    setOpen(false);
  };

  return {
    open,
    dismiss,
    /** Spread onto the button that opens the panel. */
    triggerProps: {
      ref: triggerRef,
      onClick: () => setOpen(true),
    },
    /**
     * Spread onto the panel wrapper. `tabIndex={-1}` makes it focusable
     * without adding a Tab stop; the group is named by the sentence inside it.
     */
    panelProps: {
      ref: panelRef,
      tabIndex: -1,
      role: "group",
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          dismiss();
        }
      },
    },
  };
}
