import { Bot, ChevronDown, Check, Brain, Image, Sparkles } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ModelEntry = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
  allowed?: boolean;
};

export type ModelSelectorProps = {
  models: ModelEntry[];
  currentModel?: string | null;
  onSelect?: (modelId: string) => void;
  className?: string;
  compact?: boolean;
};

function formatContextWindow(tokens?: number): string {
  if (!tokens) {
    return "";
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}k`;
  }
  return String(tokens);
}

function providerColor(provider: string): string {
  switch (provider.toLowerCase()) {
    case "anthropic":
      return "text-chart-5";
    case "openai":
      return "text-chart-2";
    case "google":
      return "text-chart-1";
    default:
      return "text-muted-foreground";
  }
}

export function ModelSelector({
  models,
  currentModel,
  onSelect,
  className,
  compact = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedModel = models.find((m) => m.id === currentModel);

  // Close on escape
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClick = () => setOpen(false);
    // Delay to avoid immediate close from the toggle click
    const id = setTimeout(() => window.addEventListener("click", handleClick), 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("click", handleClick);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="outline"
        size={compact ? "xs" : "sm"}
        onClick={() => setOpen(!open)}
        className="font-mono gap-1.5"
      >
        <Bot className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        <span className="truncate max-w-[140px] sm:max-w-[200px]">
          {selectedModel?.name || currentModel || "Select model"}
        </span>
        <ChevronDown className={cn("shrink-0 opacity-50", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
      </Button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 w-72 sm:w-80 rounded-lg border border-border bg-card shadow-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-80 overflow-y-auto">
            {/* Group by provider */}
            {Object.entries(groupByProvider(models)).map(([provider, providerModels]) => (
              <div key={provider}>
                <div className="sticky top-0 bg-card/95 backdrop-blur px-3 py-1.5 border-b border-border/50">
                  <span
                    className={cn(
                      "text-[10px] font-mono uppercase tracking-wider",
                      providerColor(provider),
                    )}
                  >
                    {provider}
                  </span>
                </div>
                {providerModels.map((model) => {
                  const isSelected = model.id === currentModel;
                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        onSelect?.(model.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-secondary/40 transition-colors",
                        isSelected && "bg-primary/5",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-mono truncate">{model.name}</span>
                          {model.reasoning && (
                            <Brain className="h-3 w-3 text-chart-5 shrink-0" title="Reasoning" />
                          )}
                          {model.input?.includes("image") && (
                            <Image className="h-3 w-3 text-chart-2 shrink-0" title="Vision" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {model.id}
                          </span>
                          {model.contextWindow && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {formatContextWindow(model.contextWindow)} ctx
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact read-only model badge */
export function ModelBadge({
  model,
  className,
}: {
  model?: ModelEntry | null;
  className?: string;
}) {
  if (!model) {
    return null;
  }
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50 text-xs font-mono",
        className,
      )}
    >
      <Sparkles className="h-3 w-3 text-primary shrink-0" />
      <span className="truncate">{model.name}</span>
      {model.contextWindow && (
        <span className="text-muted-foreground shrink-0">
          {formatContextWindow(model.contextWindow)}
        </span>
      )}
    </div>
  );
}

function groupByProvider(models: ModelEntry[]): Record<string, ModelEntry[]> {
  const groups: Record<string, ModelEntry[]> = {};
  for (const m of models) {
    const key = m.provider || "other";
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(m);
  }
  return groups;
}
