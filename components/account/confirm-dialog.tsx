"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useState } from "react";
import { cn } from "@/lib/utils";

// "Are you sure?" before anything that can't be undone (deleting the account, deleting a rating). Base UI's
// alert dialog traps focus, closes on Escape, and returns focus to the button that opened it. The action
// runs inside; an error is shown in the dialog so the person can try again or cancel.
export function ConfirmDialog({ trigger, triggerClassName, title, body, confirmLabel, busyLabel, onConfirm }: {
  trigger: React.ReactNode; triggerClassName: string; title: string; body: React.ReactNode;
  confirmLabel: string; busyLabel: string; onConfirm: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    const e = await onConfirm();
    setBusy(false);
    if (e) setError(e); else setOpen(false);
  };
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); setError(null); } }}>
      <AlertDialog.Trigger className={triggerClassName}>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-page/70 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-raised p-6 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.35)] ring-1 ring-hairline transition-[opacity,transform] duration-200 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
          <AlertDialog.Title className="text-[19px] font-semibold tracking-tight text-text">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[15px] leading-relaxed text-text-secondary">{body}</AlertDialog.Description>
          {error && <p role="alert" className="mt-3 text-sm text-big-gap">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <AlertDialog.Close disabled={busy} className="inline-flex min-h-11 items-center rounded-full bg-hairline/60 px-5 text-[15px] font-medium text-text hover:bg-hairline focus-visible:outline-2 focus-visible:outline-brand">
              Cancel
            </AlertDialog.Close>
            <button type="button" disabled={busy} onClick={run}
              className={cn("inline-flex min-h-11 items-center rounded-full bg-big-gap px-5 text-[15px] font-medium text-white disabled:opacity-60 dark:text-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-big-gap")}>
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
