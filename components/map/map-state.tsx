"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InstitutionSummary, Scores } from "@/lib/types";

export type Mode = "gap" | "paper" | "practice";
export type TypeFilter = "all" | "college" | "university";

type MapState = {
  schools: InstitutionSummary[];
  mode: Mode;
  setMode: (m: Mode) => void;
  typeFilter: TypeFilter;
  setTypeFilter: (t: TypeFilter) => void;
  /** Slug of a school whose Onus count just went up, for a one-time pulse. */
  pulse: { slug: string; at: number } | null;
};

const Ctx = createContext<MapState | null>(null);

export function useMapState() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMapState outside MapStateProvider");
  return v;
}

// Holds the school list and keeps scores live: Supabase Realtime on institution_scores (no polling).
// When refresh_scores runs after a rating, the row update arrives here and the dot and panel update.
export function MapStateProvider({ initial, children }: { initial: InstitutionSummary[]; children: React.ReactNode }) {
  const [schools, setSchools] = useState(initial);
  // Opens on On paper: real, verified policy grades. In practice is still mostly sample ratings.
  const [mode, setMode] = useState<Mode>("paper");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [pulse, setPulse] = useState<MapState["pulse"]>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("institution_scores")
      .on("postgres_changes", { event: "*", schema: "public", table: "institution_scores" }, (payload) => {
        const row = payload.new as Scores & { institution_id: string };
        if (!row?.institution_id) return;
        const next: Scores = {
          ...row,
          paper_gpa: row.paper_gpa === null ? null : Number(row.paper_gpa),
          practice_gpa: row.practice_gpa === null ? null : Number(row.practice_gpa),
          gap: row.gap === null ? null : Number(row.gap),
        };
        setSchools((prev) =>
          prev.map((s) => {
            if (s.id !== row.institution_id) return s;
            if ((next.n_onus ?? 0) > (s.scores?.n_onus ?? 0)) setPulse({ slug: s.slug, at: Date.now() });
            return { ...s, scores: next };
          })
        );
      })
      .subscribe((status) => {
        // Development only: lets tests wait until the channel is live before changing a score.
        if (process.env.NODE_ENV !== "production") (window as unknown as { __onusRealtime?: string }).__onusRealtime = status;
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const value = useMemo(() => ({ schools, mode, setMode, typeFilter, setTypeFilter, pulse }), [schools, mode, typeFilter, pulse]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
