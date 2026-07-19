import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useAppSwitcher } from "./useAppSwitcher";
import type { SwitcherApp } from "./apps";
import { cn } from "./cn";

export interface AppSwitcherProps {
  appName: string; // current app display name, e.g. "Carbo Sales"
  appKey: string; // current app key, e.g. "crm" | "admin" | "ops" | "financas"
  logoSrc: string; // the Carbo logo image
  supabase: { from: (t: string) => any };
  userId?: string | null;
}

function AppRow({
  app,
  onNavigate,
}: {
  app: SwitcherApp;
  onNavigate: (app: SwitcherApp) => void;
}) {
  const Icon = app.icon;
  const chip = (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: app.accent + "1A", color: app.accent }}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );

  const label = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span
        className={cn(
          "truncate text-sm font-semibold text-foreground",
          app.current && "text-primary"
        )}
      >
        {app.name}
      </span>
      <span className="truncate text-xs text-muted-foreground">{app.tag}</span>
    </span>
  );

  if (app.current) {
    return (
      <div
        role="menuitem"
        aria-current="true"
        tabIndex={-1}
        className="flex w-full cursor-default items-center gap-3 rounded-lg bg-primary/10 px-2 py-2 text-left"
      >
        {chip}
        {label}
        <Check className="h-4 w-4 shrink-0 text-primary" />
      </div>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => onNavigate(app)}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
    >
      {chip}
      {label}
    </button>
  );
}

export function AppSwitcher(props: AppSwitcherProps) {
  const { apps, loading } = useAppSwitcher({
    supabase: props.supabase,
    userId: props.userId,
    currentKey: props.appKey,
  });

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Drive the entrance transition after the panel is in the DOM.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }
    setMounted(false);
  }, [open]);

  // Outside-click + Escape to close.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const navigate = (app: SwitcherApp) => {
    setOpen(false);
    if (typeof window !== "undefined") window.location.href = app.href;
  };

  const hub = apps.find((a) => a.isHub);
  const rest = apps.filter((a) => !a.isHub);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Trocar de sistema"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
      >
        <img src={props.logoSrc} alt="" className="h-7 w-auto" />
        <span className="hidden text-sm font-bold text-foreground sm:inline">
          {props.appName}
        </span>
        <ChevronsUpDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && apps.length > 0 && (
        <div
          role="menu"
          aria-label="Trocar de sistema"
          className="absolute left-0 z-50 mt-1 w-[300px] rounded-xl border border-border bg-popover p-1.5 shadow-xl"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(-4px)",
            transition: "opacity 150ms ease, transform 150ms ease",
          }}
        >
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Trocar de sistema
          </div>

          {hub && <AppRow app={hub} onNavigate={navigate} />}
          {hub && rest.length > 0 && <div className="my-1 border-t border-border" />}

          {rest.map((app) => (
            <AppRow key={app.key} app={app} onNavigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default AppSwitcher;
