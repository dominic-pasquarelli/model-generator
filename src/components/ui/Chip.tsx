import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/icons/Icon";

export type ChipTone =
  | "uncal"
  | "inferred"
  | "measured"
  | "confirmed"
  | "generated"
  | "missing"
  | "neutral";

const TONE_CLASS: Record<ChipTone, string> = {
  uncal: "chip-uncal",
  inferred: "chip-inferred",
  measured: "chip-measured",
  confirmed: "chip-confirmed",
  generated: "chip-generated",
  missing: "chip-missing",
  neutral: "chip-neutral",
};

export interface ChipProps {
  tone: ChipTone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}

/** Low-level pill. State is never color-only — pair a tone with an icon + label. */
export function Chip({ tone, icon, children, className }: ChipProps) {
  return (
    <span className={cn("chip", TONE_CLASS[tone], className)}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}

/** Canonical state vocabulary chip (UX Vision). Each state binds tone + icon + label. */
export type StateName =
  | "uncalibrated"
  | "inferred"
  | "measured"
  | "confirmed"
  | "generated"
  | "exported"
  | "missing";

const STATE_META: Record<StateName, { tone: ChipTone; icon?: IconName; label: string }> = {
  uncalibrated: { tone: "uncal", icon: "crosshair", label: "Uncalibrated" },
  inferred: { tone: "inferred", icon: "approx", label: "Inferred" },
  measured: { tone: "measured", icon: "ruler", label: "Measured" },
  confirmed: { tone: "confirmed", icon: "check", label: "Confirmed" },
  generated: { tone: "generated", icon: "cube-flat", label: "Generated" },
  exported: { tone: "neutral", label: "Exported" },
  missing: { tone: "missing", label: "Missing" },
};

export interface StateChipProps {
  state: StateName;
  /** Override the default label (e.g. "Missing ⌀", "Calibrated 10.0 px/mm"). */
  label?: ReactNode;
  className?: string;
}

export function StateChip({ state, label, className }: StateChipProps) {
  const meta = STATE_META[state];
  const chipProps = meta.icon ? { tone: meta.tone, icon: meta.icon } : { tone: meta.tone };
  return (
    <Chip {...chipProps} className={className}>
      {label ?? meta.label}
    </Chip>
  );
}
