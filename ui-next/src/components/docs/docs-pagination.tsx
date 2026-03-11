import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface PaginationPage {
  title: string;
  url: string;
}

export function DocsPagination({ prev, next }: { prev?: PaginationPage; next?: PaginationPage }) {
  if (!prev && !next) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex mt-10 pt-6 border-t border-border gap-4",
        next && !prev ? "justify-end" : "justify-between",
      )}
    >
      {prev && (
        <Link
          to={prev.url}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group max-w-[45%]"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 group-hover:text-primary transition-colors" />
          <span className="flex flex-col items-start">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">
              Previous
            </span>
            <span className="truncate font-medium">{prev.title}</span>
          </span>
        </Link>
      )}
      {next && (
        <Link
          to={next.url}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group max-w-[45%] ml-auto"
        >
          <span className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">
              Next
            </span>
            <span className="truncate font-medium">{next.title}</span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 group-hover:text-primary transition-colors" />
        </Link>
      )}
    </div>
  );
}
