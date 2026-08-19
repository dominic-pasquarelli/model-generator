import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/icons/Icon";
import { Chip } from "./Chip";

export function FileBox({
  name,
  icon = "file",
  right,
  mono = true,
}: {
  name: ReactNode;
  icon?: IconName;
  right?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="filebox">
      <Icon name={icon} />
      <span className={cn(mono && "mono")} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </span>
      {right ? <span style={{ marginLeft: "auto" }}>{right}</span> : null}
    </div>
  );
}

/** Diagnosable error report — a code + feature + parameters, never a bare "failed". */
export function ErrorReportBox({ children }: { children: ReactNode }) {
  return <div className="errbox">{children}</div>;
}

export function MetaGrid({ rows }: { rows: Array<{ dt: ReactNode; dd: ReactNode }> }) {
  return (
    <dl className="meta-grid">
      {rows.map((r, i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{r.dt}</dt>
          <dd>{r.dd}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReadyRow({ children }: { children: ReactNode }) {
  return (
    <div className="ready-row">
      <Icon name="check" />
      <span>{children}</span>
    </div>
  );
}

export function RadioCard({
  selected,
  name,
  ext,
  desc,
  onSelect,
}: {
  selected: boolean;
  name: ReactNode;
  ext: string;
  desc: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("fmt-card", selected && "is-on")}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
    >
      <span className="radio" />
      <div className="fmt-name">
        {name} <Chip tone="neutral">{ext}</Chip>
      </div>
      <div className="fmt-desc">{desc}</div>
    </button>
  );
}

export function BlockerRow({ title, body, fix }: { title: ReactNode; body: ReactNode; fix?: ReactNode }) {
  return (
    <div className="blocker">
      <Icon name="alert-circle" />
      <div>
        <div className="bt">{title}</div>
        <div className="bd">{body}</div>
      </div>
      {fix ? <span className="vfix">{fix}</span> : null}
    </div>
  );
}
