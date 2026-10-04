"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchSchools } from "@/lib/school-search";
import { useMapState } from "./map-state";

// Find a school by name or short name (UBC, SFU, BCIT). Choosing one opens its panel; the map flies there
// because the selection comes from the URL. A combobox: arrow keys move through the results, Enter opens,
// Escape clears.
export function SchoolSearch() {
  const { schools } = useMapState();
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchSchools(schools, query).slice(0, 6), [schools, query]);
  const showList = open && query.trim().length > 0;

  const choose = (href: string) => {
    router.push(href, { scroll: false });
    setQuery("");
    setOpen(false);
    input.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { const r = results[active]; if (r) { e.preventDefault(); choose(r.href); } }
    else if (e.key === "Escape") { if (query) { e.stopPropagation(); setQuery(""); } setOpen(false); }
  };

  return (
    <div className="glass pointer-events-auto w-full rounded-[22px] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-brand md:w-[340px]" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <div className="flex items-center gap-2 px-3.5">
        <Search className="size-4 shrink-0 text-text-secondary" aria-hidden />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Find a school"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${id}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Find a school, like UBC or BCIT"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-text placeholder:text-text-secondary focus:outline-none focus-visible:outline-none"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); input.current?.focus(); }} aria-label="Clear search"
            className="hit grid size-6 shrink-0 place-items-center rounded-full bg-hairline/80 text-text-secondary hover:text-text">
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      <ul id={`${id}-list`} role="listbox" aria-label="Schools" hidden={!showList || !results.length} className="border-t border-hairline px-1.5 py-1.5">
        {results.map((r, i) => (
          <li
            key={r.href}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(r.href)}
            onMouseEnter={() => setActive(i)}
            className={cn("flex min-h-11 cursor-pointer flex-col justify-center rounded-[16px] px-3 py-1.5", i === active && "bg-hairline/70")}
          >
            <span className="text-[14px] leading-snug text-text">{r.title}</span>
            <span className="text-[12px] leading-snug text-text-secondary">{r.detail}</span>
          </li>
        ))}
      </ul>
      <p role="status" className={cn("px-4 pb-3 text-[13px] text-text-secondary", !(showList && !results.length) && "sr-only")}>
        {showList && !results.length ? <>No BC public college or university matches &ldquo;{query.trim()}&rdquo;.</> : showList ? `${results.length} ${results.length === 1 ? "school" : "schools"} found` : ""}
      </p>
    </div>
  );
}
