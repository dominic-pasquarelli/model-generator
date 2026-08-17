import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/icons/Icon";

function useEscape(onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
}

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title: ReactNode;
  icon?: IconName;
  iconClassName?: string;
  headRight?: ReactNode;
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
  /** Accessible label if the title is not a plain string. */
  ariaLabel?: string;
}

/** Modal dialog centered over a scrim within its (position:relative) container. */
export function Dialog({
  open,
  onClose,
  title,
  icon,
  iconClassName,
  headRight,
  footer,
  width = 560,
  children,
  ariaLabel,
}: DialogProps) {
  useEscape(open ? onClose : undefined);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div
        className="pop dialog-center"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      >
        <div className="pop-head">
          {icon ? <Icon name={icon} className={iconClassName} /> : null}
          <div className="pop-title">{title}</div>
          {headRight}
        </div>
        <div className="pop-body">{children}</div>
        {footer ? <div className="pop-foot">{footer}</div> : null}
      </div>
    </>
  );
}

export interface PopoverProps {
  title: ReactNode;
  icon?: IconName;
  iconClassName?: string;
  headRight?: ReactNode;
  footer?: ReactNode;
  width?: number;
  style?: React.CSSProperties;
  children: ReactNode;
  onClose?: () => void;
  ariaLabel?: string;
}

/** Anchored popover — position via `style` from the caller. */
export function Popover({
  title,
  icon,
  iconClassName,
  headRight,
  footer,
  width = 320,
  style,
  children,
  onClose,
  ariaLabel,
}: PopoverProps) {
  useEscape(onClose);
  return (
    <div
      className="pop"
      style={{ width, ...style }}
      role="dialog"
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      <div className="pop-head">
        {icon ? <Icon name={icon} className={iconClassName} /> : null}
        <div className="pop-title">{title}</div>
        {headRight}
      </div>
      <div className="pop-body">{children}</div>
      {footer ? <div className="pop-foot">{footer}</div> : null}
    </div>
  );
}

export function Spacer() {
  return <div className="spacer" />;
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return vertical ? <div className="vdiv" /> : <div className="hr" />;
}

export { cn };
