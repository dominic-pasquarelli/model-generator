import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/icons/Icon";

export function Badge({ icon, children, className }: { icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cn("badge", className)}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}
