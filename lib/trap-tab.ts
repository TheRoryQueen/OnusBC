import type { KeyboardEvent } from "react";

/** Keeps Tab and Shift+Tab cycling inside an open dialog (put it on the dialog's onKeyDown). */
export function trapTab(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])"));
  if (items.length === 0) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
