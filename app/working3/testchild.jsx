"use client";
import React, { useMemo } from "react";
import { speakerColors } from "../../lib/colorbubbledark";

export default function TestChild({ beforeLLM, afterLLM }) {
  // ============================================================
  // 1. EXTRACT METADATA AND TURN-LEVEL ENRICHMENT
  // ============================================================
  const { metadata, turnMap } = useMemo(() => {
    let meta = null;
    const map = new Map();

    if (Array.isArray(afterLLM)) {
      for (const item of afterLLM) {
        if (item?.speakerName && item?.speakerRole) {
          meta = item;
        } else if (item?.ID != null) {
          // Merge existing map data with new item data to handle async updates
          const existing = map.get(item.ID) || {};
          map.set(item.ID, { ...existing, ...item });
        }
      }
    }
    return { metadata: meta, turnMap: map };
  }, [afterLLM]);

  // ============================================================
  // 2. MERGE
  // ============================================================
  const mergedTurns = useMemo(() => {
    if (!Array.isArray(beforeLLM)) return [];
    return beforeLLM.map((turn) => {
      const enrich = turnMap.get(turn.ID) || {};
      return { ...turn, ...enrich };
    });
  }, [beforeLLM, turnMap]);

  // ============================================================
  // 3. UTILITIES
  // ============================================================
  function getSpeakerLabel(turn) {
    if (!metadata?.speakerName) return `Speaker ${turn.speaker}`;
    return metadata.speakerName[turn.speaker] || `Speaker ${turn.speaker}`;
  }

  function getSpeakerRole(turn) {
    if (!metadata?.speakerRole) return "";
    const r = metadata.speakerRole[turn.speaker];
    return r ? ` - ${r}` : "";
  }

  function firstFiveWords(text) {
    if (!text) return "";
    return text.split(/\s+/).slice(0, 5).join(" ") + "…";
  }

  // ============================================================
  // 4. TERM HIGHLIGHTING (Dark Mode Adapted)
  // ============================================================
  function highlightTerms(text, lookup, turnId, errorMatch) {
    if (!text || typeof text !== "string") return text;

    const errors = Array.isArray(errorMatch)
      ? errorMatch.filter(Boolean)
      : errorMatch ? [errorMatch] : [];
    const lookups = lookup?.lookupTerm || [];
    const matches = [];

    function find(haystack, needle, type) {
      if (!needle) return;
      const re = new RegExp(needle, "gi");
      let m;
      while ((m = re.exec(haystack)) !== null) {
        matches.push({
          type,
          start: m.index,
          end: m.index + m[0].length,
          text: m[0],
          needle,
        });
      }
    }

    errors.forEach((e) => find(text, e, "error"));
    lookups.forEach((t) => find(text, t, "lookup"));

    if (!matches.length) return text;
    matches.sort((a, b) => a.start - b.start);

    const out = [];
    let cursor = 0;

    for (const m of matches) {
      if (m.start > cursor) {
        out.push({ type: "text", text: text.slice(cursor, m.start) });
      }
      out.push(m);
      cursor = m.end;
    }
    if (cursor < text.length) {
      out.push({ type: "text", text: text.slice(cursor) });
    }

    return out.map((seg, i) => {
      if (seg.type === "text") return seg.text;

      // Dark Mode: Red highlight
      if (seg.type === "error") {
        return (
          <span
            key={`err-${turnId}-${i}`}
            className="bg-red-500/30 text-red-200 border border-red-500/50 px-1 rounded mx-0.5"
          >
            {seg.text}
          </span>
        );
      }

      // Dark Mode: Blue highlight
      if (seg.type === "lookup") {
        const index = lookups.indexOf(seg.needle);
        return (
          <a
            key={`lk-${turnId}-${i}`}
            href={`#lookup-${turnId}-${index}`}
            className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/50"
          >
            {seg.text}
          </a>
        );
      }
      return seg.text;
    });
  }

  // ============================================================
  // 5. BUBBLE COMPONENT
  // ============================================================
  function TranscriptBubble({ turn }) {
    const roleRaw = getSpeakerRole(turn);
    const cleanRole = roleRaw.replace(/^ - /, "").trim().toLowerCase();

    const rawErrorMatch = turn.error?.errorMatch;
    const cleanErrors = Array.isArray(rawErrorMatch)
      ? rawErrorMatch.filter((x) => typeof x === "string" && x.trim())
      : [];

    const showFollowup =
      turn.followup &&
      Array.isArray(turn.followup.followupQuestion) &&
      cleanRole !== "interviewer";

    // NEW: Check for Response Assessment Data
    // Note: The structure depends on what your /api/response returns.
    // Based on previous context, it returns { responseScore, responseSummation }
    const responseData = turn.response; 

    return (
      <div
        className={`flex ${
          turn.speaker % 2 === 0 ? "justify-start" : "justify-end"
        } mb-4`}
      >
        <div className="max-w-3xl w-full">
          {/* Bubble */}
          <div
            className={`px-4 py-3 border rounded-2xl shadow-sm backdrop-blur-sm ${
              speakerColors[turn.speaker % speakerColors.length]
            }`}
          >
            {/* Header: Name & Role */}
            <div className="font-semibold text-sm mb-1 opacity-90 flex items-baseline gap-2">
              <span>{getSpeakerLabel(turn)}</span>
              <span className="text-xs opacity-70 font-normal tracking-wide">
                {roleRaw}
              </span>
            </div>

            {/* Content Body */}
            <div className="text-[15px] leading-relaxed">
              {highlightTerms(
                turn.text,
                turn.lookup,
                turn.ID,
                turn.error?.errorMatch
              )}
            </div>
          </div>

          {/* Metadata under bubble */}
          <div className="mt-2 space-y-2 px-1">
            
            {/* 1. Errors */}
            {cleanErrors.length > 0 && (
              <div className="text-red-300/90 bg-red-950/30 p-2 rounded border border-red-900/50">
                <div className="font-bold text-xs uppercase tracking-wider mb-1 text-red-400">
                  ⚠️ Error Detected
                </div>
                {cleanErrors.map((err, i) => (
                  <div key={i} className="text-sm pl-2 border-l-2 border-red-500/30">
                    <span className="italic opacity-80">“{firstFiveWords(err)}”</span> –{" "}
                    {Array.isArray(turn.error?.errorExplanation)
                      ? turn.error.errorExplanation[i]
                      : turn.error?.errorExplanation}
                  </div>
                ))}
              </div>
            )}

            {/* 2. Response Assessment (NEW) */}
            {responseData && (
               <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-md text-sm">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold text-blue-400 uppercase text-xs">
                      AI Assessment
                    </span>
                    <span className={`font-bold ${responseData.responseScore >= 0.8 ? 'text-green-400' : 'text-amber-400'}`}>
                      Score: {(responseData.responseScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-zinc-300">
                    {responseData.responseSummation}
                  </p>
               </div>
            )}

            {/* 3. Follow-up */}
            {showFollowup && (
              <div className="text-purple-200/90 bg-purple-950/30 p-2 rounded border border-purple-900/50">
                <div className="font-bold text-xs uppercase tracking-wider mb-1 text-purple-400">
                  💬 Suggested Follow-up
                </div>
                {turn.followup.followupQuestion.map((q, i) => (
                  <div key={i} className="text-sm pl-2 border-l-2 border-purple-500/30">
                    {q}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 6. GLOBAL LOOKUP
  // ============================================================
  const allLookupItems = useMemo(() => {
    const out = [];
    for (const t of mergedTurns) {
      if (t.lookup?.lookupTerm) {
        t.lookup.lookupTerm.forEach((term, i) => {
          out.push({
            turnId: t.ID,
            term,
            explanation: t.lookup.lookupExplanation?.[i] || "",
            link: t.lookup.lookupLink?.[i] || "",
            index: i,
          });
        });
      }
    }
    return out;
  }, [mergedTurns]);

  // ============================================================
  // 7. RENDER
  // ============================================================
  if (!mergedTurns.length) {
    return (
      <div className="p-4 text-zinc-500 animate-pulse">
        Waiting for transcript...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 text-zinc-100">
      {mergedTurns.map((turn) => (
        <TranscriptBubble key={turn.ID} turn={turn} />
      ))}

      {/* References Section */}
      {allLookupItems.length > 0 && (
        <div className="mt-12 border-t border-zinc-800 pt-6">
          <div className="text-lg font-semibold mb-4 text-zinc-300">
            References
          </div>
          <div className="space-y-4">
            {allLookupItems.map((item) => (
              <div
                key={`ref-${item.turnId}-${item.index}`}
                id={`lookup-${item.turnId}-${item.index}`}
                className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800"
              >
                <div className="font-medium text-blue-300 mb-1">{item.term}</div>
                <div className="text-sm text-zinc-400 leading-relaxed mb-2">
                  {item.explanation}
                </div>
                <a
                  href={item.link}
                  target="_blank"
                  className="text-blue-400 hover:text-blue-300 text-xs break-all flex items-center gap-1"
                >
                  <span className="opacity-70">🔗</span> {item.link}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}