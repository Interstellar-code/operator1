import { Search, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONFIG_SECTIONS, ALL_SETTINGS_ICON, getSectionMetaOrDefault } from "@/lib/config-sections";
import { cn } from "@/lib/utils";

type ConfigSidebarProps = {
  activeSection: string | null;
  onSectionChange: (section: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  formMode: "form" | "raw";
  onFormModeChange: (mode: "form" | "raw") => void;
  isValid: boolean | null;
  sectionIssues: Record<string, unknown>;
  availableSections?: string[];
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
};

export function ConfigSidebar({
  activeSection,
  onSectionChange,
  searchQuery,
  onSearchChange,
  formMode,
  onFormModeChange,
  isValid,
  sectionIssues: _sectionIssues,
  availableSections,
  collapsed,
  onCollapse,
}: ConfigSidebarProps) {
  // Build visible sections: predefined order first, then unknown sections
  const visibleSections = (() => {
    if (!availableSections) {
      return CONFIG_SECTIONS;
    }

    const available = new Set(availableSections);
    const known = CONFIG_SECTIONS.filter((s) => available.has(s.key));
    const knownKeys = new Set(known.map((s) => s.key));
    const unknown = availableSections
      .filter((key) => !knownKeys.has(key))
      .map((key) => getSectionMetaOrDefault(key));
    return [...known, ...unknown];
  })();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with collapse toggle + validation badge */}
      <div
        className={cn(
          "flex items-center border-b border-border/50",
          collapsed ? "justify-center px-2 py-3" : "justify-between px-3 py-3",
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Settings</span>
            {isValid !== null && (
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full",
                  isValid ? "bg-chart-2/10 text-chart-2" : "bg-destructive/10 text-destructive",
                )}
              >
                {isValid ? "valid" : "invalid"}
              </span>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => onCollapse(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronsLeft className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Search (hidden when collapsed) */}
      {!collapsed && (
        <div className="px-3 py-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={cn(
                "w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-xs",
                "focus:outline-none focus:ring-2 focus:ring-primary/30",
                "placeholder:text-muted-foreground/50",
              )}
            />
          </div>
        </div>
      )}

      {/* Section nav — scrollable */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto min-h-0 py-1 space-y-0.5",
          collapsed ? "px-1.5" : "px-2",
        )}
      >
        {/* All Settings */}
        <div className="relative group">
          <button
            type="button"
            onClick={() => onSectionChange(null)}
            className={cn(
              "flex w-full items-center rounded-md transition-colors",
              collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-2 text-sm",
              activeSection === null
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <ALL_SETTINGS_ICON className="h-4 w-4 shrink-0" />
            {!collapsed && "All Settings"}
          </button>
          {collapsed && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block">
              <div className="rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md whitespace-nowrap">
                All Settings
              </div>
            </div>
          )}
        </div>

        {/* Individual sections */}
        {visibleSections.map((section) => (
          <div key={section.key} className="relative group">
            <button
              type="button"
              onClick={() => onSectionChange(section.key)}
              className={cn(
                "flex w-full items-center rounded-md transition-colors",
                collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-2 text-sm",
                activeSection === section.key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <section.icon className="h-4 w-4 shrink-0" />
              {!collapsed && section.label}
            </button>
            {collapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block">
                <div className="rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md whitespace-nowrap">
                  {section.label}
                </div>
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Form / Raw toggle */}
      <div
        className={cn(
          "border-t border-border/50 shrink-0",
          collapsed ? "px-1.5 py-2" : "px-3 py-3",
        )}
      >
        {collapsed ? (
          <div className="flex flex-col gap-1">
            <div className="relative group">
              <button
                type="button"
                onClick={() => onFormModeChange("form")}
                className={cn(
                  "flex w-full items-center justify-center rounded-md py-1.5 text-[10px] font-medium transition-colors",
                  formMode === "form"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                F
              </button>
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block">
                <div className="rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md whitespace-nowrap">
                  Form view
                </div>
              </div>
            </div>
            <div className="relative group">
              <button
                type="button"
                onClick={() => onFormModeChange("raw")}
                className={cn(
                  "flex w-full items-center justify-center rounded-md py-1.5 text-[10px] font-medium transition-colors",
                  formMode === "raw"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                R
              </button>
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block">
                <div className="rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md whitespace-nowrap">
                  Raw JSON view
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => onFormModeChange("form")}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium transition-colors",
                formMode === "form"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              Form
            </button>
            <button
              type="button"
              onClick={() => onFormModeChange("raw")}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium transition-colors border-l border-border",
                formMode === "raw"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              Raw
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
