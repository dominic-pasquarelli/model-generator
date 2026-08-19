import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/icons/Icon";

export function Field({
  label,
  span2,
  children,
  help,
  helpError,
}: {
  label?: ReactNode;
  span2?: boolean;
  children: ReactNode;
  help?: ReactNode;
  helpError?: boolean;
}) {
  return (
    <div className={cn("field", span2 && "span2")}>
      {label != null ? <label>{label}</label> : null}
      {children}
      {help ? <div className={cn("fhelp", helpError && "is-err")}>{help}</div> : null}
    </div>
  );
}

export interface NumberFieldProps {
  label?: ReactNode;
  value: number | null;
  onCommit: (value: number | null) => void;
  unit?: string;
  placeholder?: string;
  decimals?: number;
  invalid?: boolean;
  span2?: boolean;
  help?: ReactNode;
  helpError?: boolean;
  min?: number;
  max?: number;
  ariaLabel?: string;
}

export interface CommitDecision {
  /** Whether onCommit should fire (false = revert / no change). */
  commit: boolean;
  /** The value to commit (rounded to `decimals`, clamped to [min,max]), or null. */
  value: number | null;
}

/**
 * Pure decision for what a NumberField commit should do. Guarantees:
 * - empty input → null, but only a *change* commits (already-null stays no-op);
 * - non-finite text → no commit (revert);
 * - finite value is rounded to `decimals` so the stored value equals the displayed one;
 * - min/max are clamped;
 * - a value equal to the current one does not commit (no spurious version bump).
 */
export function resolveCommit(
  raw: string,
  current: number | null,
  decimals: number,
  min?: number,
  max?: number,
): CommitDecision {
  const trimmed = raw.trim();
  if (trimmed === "") return { commit: current !== null, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { commit: false, value: current };
  let rounded = Number(n.toFixed(decimals));
  if (min != null && rounded < min) rounded = min;
  if (max != null && rounded > max) rounded = max;
  if (current != null && rounded === current) return { commit: false, value: current };
  return { commit: true, value: rounded };
}

/**
 * Numeric control. Clearing the field commits `null` (unknown) — never 0. The stored
 * value is exactly what is shown (rounded to `decimals`). Enter and blur each commit
 * exactly once; Escape reverts without committing.
 */
export function NumberField({
  label,
  value,
  onCommit,
  unit,
  placeholder = "—",
  decimals = 2,
  invalid,
  span2,
  help,
  helpError,
  min,
  max,
  ariaLabel,
}: NumberFieldProps) {
  const display = (v: number | null) => (v == null ? "" : v.toFixed(decimals));
  const [buffer, setBuffer] = useState<string>(display(value));
  const [focused, setFocused] = useState(false);
  const skipCommit = useRef(false);
  const id = useId();

  useEffect(() => {
    if (!focused) setBuffer(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, focused]);

  const commit = () => {
    // Escape reverts without committing — its blur must not persist the edited text.
    if (skipCommit.current) {
      skipCommit.current = false;
      setBuffer(display(value));
      return;
    }
    const decision = resolveCommit(buffer, value, decimals, min, max);
    if (decision.commit) onCommit(decision.value);
    else setBuffer(display(value)); // revert display to the canonical value
  };

  const control = (
    <div className={cn("control", invalid && "is-invalid", value == null && !focused && buffer === "" && "is-empty")}>
      <input
        id={id}
        className="val num"
        inputMode="decimal"
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        aria-invalid={invalid || undefined}
        value={buffer}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Blur triggers the single commit path (onBlur → commit) — do not commit here too.
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            skipCommit.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unit ? <span className="unit">{unit}</span> : null}
    </div>
  );

  if (label == null && !help) return control;
  return (
    <Field label={label} span2={span2} help={help} helpError={helpError}>
      {control}
    </Field>
  );
}

export interface TextInputProps {
  label?: ReactNode;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  span2?: boolean;
  help?: ReactNode;
  mono?: boolean;
  ariaLabel?: string;
}

export function TextInput({ label, value, onCommit, placeholder, span2, help, mono, ariaLabel }: TextInputProps) {
  const [buffer, setBuffer] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setBuffer(value);
  }, [value, focused]);

  const control = (
    <div className={cn("control", value === "" && !focused && "is-empty")}>
      <input
        className={cn("val", mono && "mono")}
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        value={buffer}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onCommit(buffer);
        }}
        onChange={(e) => setBuffer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
  if (label == null && !help) return control;
  return (
    <Field label={label} span2={span2} help={help}>
      {control}
    </Field>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectFieldProps<T extends string> {
  label?: ReactNode;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  span2?: boolean;
  help?: ReactNode;
  ariaLabel?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  span2,
  help,
  ariaLabel,
}: SelectFieldProps<T>) {
  const current = options.find((o) => o.value === value);
  const control = (
    <div className="control is-select" style={{ position: "relative" }}>
      <span className="val">{current?.label ?? value}</span>
      <Icon name="chevron-down" />
      <select
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
  if (label == null && !help) return control;
  return (
    <Field label={label} span2={span2} help={help}>
      {control}
    </Field>
  );
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel }: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="seg" role="radiogroup" aria-label={ariaLabel} ref={ref}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={cn(o.value === value && "is-on")}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <button type="button" className="cbrow" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className={cn("cb", checked && "is-on")}>{checked ? <Icon name="check" /> : null}</span>
      <span>{label}</span>
    </button>
  );
}
