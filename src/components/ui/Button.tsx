import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/icons/Icon";

export type ButtonVariant = "secondary" | "primary" | "ghost" | "danger-soft" | "dark";
export type ButtonSize = "md" | "sm" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  secondary: "",
  primary: "btn-primary",
  ghost: "btn-ghost",
  "danger-soft": "btn-danger-soft",
  dark: "btn-dark",
};

const SIZE_CLASS: Record<ButtonSize, string> = { md: "", sm: "btn-sm", lg: "btn-lg" };

export function Button({ variant = "secondary", size = "md", icon, className, children, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn("btn", VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
}

export function IconButton({ icon, label, className, type, ...rest }: IconButtonProps) {
  return (
    <button type={type ?? "button"} className={cn("iconbtn", className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
