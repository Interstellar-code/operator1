/**
 * Shared keyword highlight component.
 * Wraps matching substrings in <mark> tags with configurable styling.
 * Extracted from docs.tsx for reuse across memory search, docs search, etc.
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightText({
  text,
  term,
  className,
}: {
  text: string;
  term: string;
  className?: string;
}) {
  if (!term.trim()) {
    return <>{text}</>;
  }
  const re = new RegExp(`(${escapeRegex(term)})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark
            key={i}
            className={className ?? "bg-primary/25 text-primary rounded-sm px-0.5 not-italic"}
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
