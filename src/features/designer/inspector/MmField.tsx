import { NumberField, type NumberFieldProps } from "@/components/ui/fields";
import { fromDisplay, toDisplay, unitDecimals, unitLabel } from "@/core/units/units";
import { useStore } from "@/state/store";

type MmFieldProps = Omit<NumberFieldProps, "value" | "onCommit" | "unit" | "decimals"> & {
  /** Canonical value in millimetres (or null for unknown). */
  mm: number | null;
  /** Receives the committed value converted back to millimetres (or null). */
  onCommitMm: (mm: number | null) => void;
};

/**
 * A NumberField that displays and edits a canonical millimetre value in the project's
 * active display unit (mm or inch). The stored model stays in millimetres; only the
 * shown/typed representation is converted, so unit is a display concern, never geometry.
 */
export function MmField({ mm, onCommitMm, ...rest }: MmFieldProps) {
  const unit = useStore((s) => s.current?.units ?? "mm");
  const decimals = unitDecimals(unit);
  return (
    <NumberField
      {...rest}
      value={mm == null ? null : Number(toDisplay(mm, unit).toFixed(decimals))}
      unit={unitLabel(unit)}
      decimals={decimals}
      onCommit={(v) => onCommitMm(v == null ? null : fromDisplay(v, unit))}
    />
  );
}
