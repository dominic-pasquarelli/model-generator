import { cn } from "@/lib/cn";
import { Icon } from "@/icons/Icon";

export function Spinner({ className }: { className?: string }) {
  return <Icon name="spinner" className={cn("spin", className)} />;
}

export interface ProgressBarProps {
  /** 0–100. */
  value: number;
  className?: string;
  label?: string;
}

export function ProgressBar({ value, className, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("progress", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}
