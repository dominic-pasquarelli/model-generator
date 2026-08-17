import { cn } from "@/lib/cn";
import { Icon } from "@/icons/Icon";
import type { FixTarget, Severity, Validation } from "@/core/validation/validate";
import { summarize } from "@/core/validation/validate";

const SEV_ICON: Record<Severity, "alert-circle" | "triangle" | "info"> = {
  error: "alert-circle",
  warning: "triangle",
  info: "info",
};

function ValidationItem({ item, onFix }: { item: Validation; onFix: (t: FixTarget) => void }) {
  return (
    <div className={cn("vitem", `vitem-${item.severity === "warning" ? "warn" : item.severity === "error" ? "err" : "info"}`)}>
      <Icon name={SEV_ICON[item.severity]} />
      <div className="vbody">
        <div className="vt">{item.title}</div>
        <div className="vd">{item.body}</div>
      </div>
      {item.fix ? (
        <button className="vfix" onClick={() => onFix(item.fix!.target)}>
          {item.fix.label}
        </button>
      ) : null}
    </div>
  );
}

export function ValidationPanel({ items, onFix }: { items: Validation[]; onFix: (t: FixTarget) => void }) {
  const s = summarize(items);
  const clear = s.errors === 0 && s.warnings === 0;
  return (
    <section className="vwrap" aria-label="Validation">
      <div className="vhead">
        <div className="insp-title">Validation</div>
        <div className="vcounts" aria-live="polite">
          {clear ? (
            <span className="vcount vcount-ok">
              <Icon name="check" />
              Clear
            </span>
          ) : (
            <>
              <span className="vcount vcount-err">
                <Icon name="alert-circle" />
                {s.errors}
              </span>
              <span className="vcount vcount-warn">
                <Icon name="triangle" />
                {s.warnings}
              </span>
            </>
          )}
          <span className="vcount vcount-info">
            <Icon name="info" />
            {s.infos}
          </span>
        </div>
      </div>
      <div className="vlist">
        {items.map((item) => (
          <ValidationItem key={item.id} item={item} onFix={onFix} />
        ))}
      </div>
    </section>
  );
}
