import { Construction } from "lucide-react";

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] animate-fade-in">
      <Construction className="w-12 h-12 text-matrix-green/30 mb-4" />
      <h2 className="text-lg font-mono text-matrix-green text-glow-sm mb-2">{title}</h2>
      <p className="text-sm text-matrix-text-muted text-center max-w-md">{description}</p>
      <div className="mt-6 px-3 py-1.5 rounded-full bg-matrix-surface border border-matrix-border">
        <span className="text-[11px] font-mono text-matrix-text-muted">Coming Soon</span>
      </div>
    </div>
  );
}
