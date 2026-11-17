"use client";
import type { ReactNode } from "react";

/** A submit button that asks before running a destructive form action. */
export function ConfirmButton({ action, message, children, className }: { action: (formData: FormData) => void | Promise<void>; message: string; children: ReactNode; className?: string }) {
  return (
    <button type="submit" formAction={action} formNoValidate className={className}
      onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
