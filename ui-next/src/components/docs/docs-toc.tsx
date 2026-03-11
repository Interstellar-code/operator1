import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  text: string;
  depth: 2 | 3;
}

/** Parse H2/H3 headings from a raw markdown string */
export function parseTocItems(markdown: string): TocItem[] {
  const lines = markdown.split("\n");
  const items: TocItem[] = [];
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      items.push({ id: slugify(h2[1]), text: h2[1].trim(), depth: 2 });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      items.push({ id: slugify(h3[1]), text: h3[1].trim(), depth: 3 });
    }
  }
  return items;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function DocsToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  // T1: compute section numbers — h2 gets "1.", h3 gets "1.1", "1.2" etc.
  const numbers = useMemo(() => {
    const map = new Map<string, string>();
    let h2 = 0;
    let h3 = 0;
    for (const item of items) {
      if (item.depth === 2) {
        h2++;
        h3 = 0;
        map.set(item.id, `${h2}.`);
      } else {
        h3++;
        map.set(item.id, `${h2}.${h3}`);
      }
    }
    return map;
  }, [items]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    observerRef.current?.disconnect();

    const visible = new Set<string>();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }
        const first = items.find((item) => visible.has(item.id));
        if (first) {
          setActiveId(first.id);
        }
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0 },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) {
        observerRef.current.observe(el);
      }
    }

    return () => observerRef.current?.disconnect();
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <aside className="hidden xl:flex flex-col w-52 shrink-0 pl-4 border-l border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        On this page
      </p>
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" });
              setActiveId(item.id);
            }}
            className={cn(
              "flex items-baseline gap-1.5 text-xs leading-relaxed transition-colors",
              item.depth === 3 && "pl-3",
              activeId === item.id
                ? "text-primary font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "font-mono tabular-nums text-[10px] shrink-0 w-6",
                activeId === item.id ? "text-primary/60" : "text-muted-foreground/35",
              )}
            >
              {numbers.get(item.id)}
            </span>
            <span className="truncate">{item.text}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}
