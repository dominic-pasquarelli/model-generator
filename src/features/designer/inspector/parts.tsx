import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/icons/Icon";

export function InspectorSection({
  icon,
  title,
  right,
  children,
}: {
  icon?: IconName;
  title: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="insp-sec">
      <div className="insp-head">
        {icon ? <Icon name={icon} /> : null}
        <div className="insp-title">{title}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function ObjectRow({
  icon,
  name,
  detail,
  right,
  selected,
  onClick,
}: {
  icon: IconName;
  name: ReactNode;
  detail?: ReactNode;
  right?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={cn("orow", selected && "is-selected")} onClick={onClick} aria-pressed={selected}>
      <span className="oic">
        <Icon name={icon} />
      </span>
      <span className="obody">
        <span className="oname">{name}</span>
        {detail ? <span className="odetail">{detail}</span> : null}
      </span>
      {right}
    </button>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.55 }}>{children}</div>;
}
