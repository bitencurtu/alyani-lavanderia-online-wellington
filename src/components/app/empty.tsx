import type { ReactNode } from "react";

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="border rounded-md p-10 text-center bg-card">
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}