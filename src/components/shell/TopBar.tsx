import type { ReactNode } from "react";
import { Icon } from "@/icons/Icon";
import { IconButton } from "@/components/ui/Button";
import { useStore } from "@/state/store";

export function Logo() {
  return (
    <div className="logo" aria-hidden="true">
      <Icon name="cube" />
    </div>
  );
}

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  return (
    <IconButton
      icon={theme === "dark" ? "sun" : "moon"}
      label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
    />
  );
}

export interface Crumb {
  label: string;
  onClick?: () => void;
  current?: boolean;
  chip?: ReactNode;
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="crumb" aria-label="Breadcrumb">
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span className="sep">/</span>
          {c.current ? (
            <span className="here">{c.label}</span>
          ) : c.onClick ? (
            <a href="#" onClick={(e) => (e.preventDefault(), c.onClick?.())}>
              {c.label}
            </a>
          ) : (
            <span>{c.label}</span>
          )}
          {c.chip ? <span style={{ marginLeft: 6 }}>{c.chip}</span> : null}
        </span>
      ))}
    </nav>
  );
}

export function TopBar({ crumbs, right }: { crumbs: Crumb[]; right?: ReactNode }) {
  return (
    <header className="topbar">
      <Logo />
      <div className="appname">Model Generator</div>
      <Breadcrumb crumbs={crumbs} />
      <div className="spacer" />
      {right}
    </header>
  );
}

/**
 * Reflects ACTUAL persistence, not `updatedAt`: "Autosaved HH:MM" only after a
 * confirmed successful write; an explicit "Unsaved" / storage error otherwise.
 */
export function SaveStateIndicator() {
  const saveState = useStore((s) => s.saveState);
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const lastSaveError = useStore((s) => s.lastSaveError);

  if (saveState === "error") {
    return (
      <div className="savestate" aria-live="polite" style={{ color: "var(--err)" }}>
        <span className="dot" style={{ background: "var(--err)" }} />
        Unsaved — {lastSaveError ?? "save error"}
      </div>
    );
  }
  if (saveState === "saved" && lastSavedAt != null) {
    const d = new Date(lastSavedAt);
    const label = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return (
      <div className="savestate" aria-live="polite">
        <span className="dot" />
        Autosaved {label}
      </div>
    );
  }
  return (
    <div className="savestate" aria-live="polite" style={{ color: "var(--text-3)" }}>
      <span className="dot" style={{ background: "var(--text-3)" }} />
      Not yet saved
    </div>
  );
}
