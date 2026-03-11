import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  className?: string;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  compact?: boolean;
  rowClassName?: (row: T) => string;
  /** Enable pagination with this many rows per page. Omit or 0 to show all rows. */
  pageSize?: number;
};

type SortDir = "asc" | "desc" | null;

export function DataTable<T extends object>({
  columns,
  data,
  keyField = "id",
  className,
  emptyMessage = "No data",
  onRowClick,
  compact = false,
  rowClassName,
  pageSize,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(0);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : sortDir === "desc" ? null : "asc");
      if (sortDir === "desc") {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) {
      return data;
    }
    return [...data].toSorted((a, b) => {
      const aRaw = (a as Record<string, unknown>)[sortKey];
      const bRaw = (b as Record<string, unknown>)[sortKey];
      if (aRaw == null && bRaw == null) {
        return 0;
      }
      if (aRaw == null) {
        return 1;
      }
      if (bRaw == null) {
        return -1;
      }
      const aStr = typeof aRaw === "object" ? JSON.stringify(aRaw) : String(aRaw as string);
      const bStr = typeof bRaw === "object" ? JSON.stringify(bRaw) : String(bRaw as string);
      const cmp = aStr.localeCompare(bStr, undefined, { numeric: true });
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [data, sortKey, sortDir]);

  // Pagination
  const usePagination = pageSize != null && pageSize > 0 && sortedData.length > pageSize;
  const totalPages = usePagination ? Math.ceil(sortedData.length / pageSize) : 1;
  const safePage = Math.min(page, totalPages - 1);
  const visibleData = usePagination
    ? sortedData.slice(safePage * pageSize, (safePage + 1) * pageSize)
    : sortedData;

  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "text-left font-mono text-xs uppercase tracking-wider text-muted-foreground",
                    compact ? "px-3 py-2" : "px-4 py-3",
                    col.className,
                  )}
                >
                  {col.sortable ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-auto p-0 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.header}
                      {sortKey === col.key && sortDir === "asc" ? (
                        <ArrowUp className="ml-1 h-3 w-3" />
                      ) : sortKey === col.key && sortDir === "desc" ? (
                        <ArrowDown className="ml-1 h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />
                      )}
                    </Button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleData.map((row, i) => (
                <tr
                  // eslint-disable-next-line @typescript-eslint/no-base-to-string
                  key={String((row as Record<string, unknown>)[keyField] ?? i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border/50 last:border-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-secondary/40",
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "text-foreground",
                        compact ? "px-3 py-1.5" : "px-4 py-2.5",
                        col.className,
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : // eslint-disable-next-line @typescript-eslint/no-base-to-string
                          String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {usePagination && (
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2">
          <span className="text-xs text-muted-foreground font-mono">
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sortedData.length)} of{" "}
            {sortedData.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground font-mono min-w-[4ch] text-center">
              {safePage + 1}/{totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
