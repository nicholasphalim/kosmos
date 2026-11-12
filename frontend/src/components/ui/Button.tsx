import { clsx } from "clsx";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "outline" | "light" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer";

const variants: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-soft",
  outline: "border-[1.5px] border-line-strong bg-white text-navy hover:bg-lilac-50",
  light: "bg-white text-navy hover:bg-lilac-100",
  ghost: "text-violet underline underline-offset-2 hover:text-navy",
};

const sizes: Record<Size, string> = {
  sm: "h-10 rounded-[10px] px-3.5 text-sm",
  md: "h-11 rounded-xl px-4 text-sm",
  lg: "h-14 rounded-2xl px-5 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant, size, loading, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <LoaderCircle className="size-4.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function ButtonLink({ variant, size, icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
