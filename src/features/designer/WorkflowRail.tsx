import { cn } from "@/lib/cn";
import { Icon } from "@/icons/Icon";
import { Button } from "@/components/ui/Button";
import type { StepState } from "./steps";

function StepFlag({ flag }: { flag?: "err" | "warn" }) {
  if (!flag) return null;
  return (
    <span className={cn("flag", flag === "err" ? "flag-err" : "flag-warn")}>
      <Icon name={flag === "err" ? "alert-circle" : "triangle"} />
    </span>
  );
}

export function WorkflowRail({
  steps,
  note,
  onSelect,
  onBack,
}: {
  steps: StepState[];
  note: string;
  onSelect: (id: StepState["def"]["id"]) => void;
  onBack: () => void;
}) {
  return (
    <nav className="rail" aria-label="Workflow steps">
      <div className="rail-title">Workflow</div>
      <div className="steps">
        {steps.map((s) => (
          <button
            key={s.def.id}
            className={cn(
              "step",
              s.status === "done" && "is-done",
              s.status === "current" && "is-current",
              s.status === "blocked" && "is-current is-blocked",
            )}
            aria-current={s.status === "current" || s.status === "blocked" ? "step" : undefined}
            disabled={!s.enabled}
            onClick={() => onSelect(s.def.id)}
          >
            <span className="n" aria-hidden="true">
              {s.status === "done" ? <Icon name="check" className="ic-sm" /> : s.def.index}
            </span>
            <span className="lbl">{s.def.label}</span>
            {s.meta ? <span className="meta">{s.meta}</span> : null}
            <StepFlag flag={s.flag} />
          </button>
        ))}
      </div>
      <div className="rail-foot">
        <Button variant="ghost" size="sm" icon="chevron-left" style={{ justifyContent: "flex-start" }} onClick={onBack}>
          Back to Library
        </Button>
        <div className="rail-note">{note}</div>
      </div>
    </nav>
  );
}
