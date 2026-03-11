import { cn } from "@/lib/utils";

export type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  detail?: string;
  className?: string;
};

export function StatCard({ icon, label, value, subtitle, detail, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:gap-3 rounded-lg p-3 sm:p-5",
        "bg-card border border-border",
        "hover:border-primary/20 transition-colors duration-200",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="text-primary/60">{icon}</div>
      </div>
      <div>
        <span className="text-xl sm:text-2xl font-mono font-bold text-primary text-glow">
          {value}
        </span>
        {subtitle && (
          <p className="mt-1 text-[10px] sm:text-[11px] text-muted-foreground hidden sm:block">
            {subtitle}
          </p>
        )}
        {detail && (
          <p className="mt-0.5 text-[10px] sm:text-[11px] text-muted-foreground/70 hidden sm:block">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
