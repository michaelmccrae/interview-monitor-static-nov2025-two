"use client";
import React, { useMemo } from "react";
// Assuming you have this library or similar logic
// import reactStringReplace from "react-string-replace"; 
import { speakerColors } from "../../lib/colorbubble";

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
          map.set(item.ID, item);
        }
      }
    }
    return { metadata: meta, turnMap: map };
  }, [afterLLM]);

  // ============================================================
  // 2. MERGE beforeLLM + afterLLM
  // ============================================================
  const mergedTurns = useMemo(() => {
    if (!Array.isArray(beforeLLM)) return [];
    return beforeLLM.map((turn) => {
      const enrich = turnMap.get(turn.ID) || {};
      return { ...turn, ...enrich };
    });
  }, [beforeLLM, turnMap]);

  // ============================================================
  // 3. SPEAKER LABELS
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

  // ============================================================
  // 4. TERM HIGHLIGHTING
  // ============================================================
  function highlightTerms(text, lookup, turnId, errorMatch) {
    if (!text || typeof text !== "string") return text;

    const errors = Array.isArray(errorMatch)
      ? errorMatch.filter(Boolean)
      : errorMatch
      ? [errorMatch]
      : [];

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

      if (seg.type === "error") {
        return (
          // Use high-contrast highlighter style for errors
          <span
            key={`err-${turnId}-${i}`}
            className="bg-red-500 text-white px-1 rounded font-medium mx-0.5"
          >
            {seg.text}
          </span>
        );
      }

      if (seg.type === "lookup") {
        const index = lookups.indexOf(seg.needle);
        return (
          // Lighter cyan color for visibility on dark backgrounds
          <a
            key={`lk-${turnId}-${i}`}
            href={`#lookup-${turnId}-${index}`}
            className="text-cyan-300 underline decoration-cyan-500/50 hover:text-cyan-100 transition-colors"
          >
            {seg.text}
          </a>
        );
      }

      return seg.text;
    });
  }

  function firstFiveWords(text) {
    if (!text) return "";
    return text.split(/\s+/).slice(0, 5).join(" ") + "…";
  }

  // ============================================================
  // 5. TRANSCRIPT BUBBLE
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

    const response = turn.response;

    // Fallback if speaker index exceeds color array length
    const bubbleClass =
      speakerColors[turn.speaker % speakerColors.length] ||
      "bg-zinc-800 border-zinc-600 text-zinc-100";

    return (
      <div
        className={`flex ${
          turn.speaker % 2 === 0 ? "justify-start" : "justify-end"
        } mb-6`}
      >
        <div className="max-w-3xl w-full">
          {/* BUBBLE: Colors now controlled entirely by `speakerColors` */}
          <div className={`px-5 py-4 border rounded-2xl shadow-sm ${bubbleClass}`}>
            
            {/* Header: Inherits text color, uses opacity for hierarchy */}
            <div className="font-bold text-sm opacity-80 mb-1 flex items-baseline">
              {getSpeakerLabel(turn)}
              <span className="text-xs opacity-60 ml-2 font-normal uppercase tracking-wider">
                {roleRaw.replace(/^ - /, "")}
              </span>
            </div>

            {/* Body: Inherits text color */}
            <div className="text-[16px] leading-relaxed opacity-95">
              {highlightTerms(
                turn.text,
                turn.lookup,
                turn.ID,
                turn.error?.errorMatch
              )}
            </div>
          </div>

          {/* METADATA: Outside bubble, on the black background */}
          <div className="mt-3 pl-2 space-y-3">
            
            {/* Response Quality Card */}
            {response && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 max-w-2xl">
                <div className="flex justify-between items-start mb-1">
                  <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    AI Assessment
                  </div>
                  <div
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      response.score > 0.7
                        ? "bg-green-900/30 text-green-400 border border-green-800"
                        : "bg-amber-900/30 text-amber-400 border border-amber-800"
                    }`}
                  >
                    Score: {response.score?.toFixed(2)}
                  </div>
                </div>
                <div className="text-sm text-zinc-300 leading-snug">
                  {response.summation}
                </div>
              </div>
            )}

            {/* Error Card */}
            {cleanErrors.length > 0 && (
              <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 max-w-2xl">
                <div className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
                  ⚠️ Potential Issues
                </div>
                {cleanErrors.map((err, i) => (
                  <div key={i} className="mb-2 last:mb-0 text-sm">
                    <span className="text-red-200 bg-red-900/40 px-1 rounded mx-1 font-mono text-xs">
                      "{firstFiveWords(err)}"
                    </span>
                    <span className="text-zinc-400">
                      {Array.isArray(turn.error?.errorExplanation)
                        ? turn.error.errorExplanation[i]
                        : turn.error?.errorExplanation}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Follow-up Card */}
            {showFollowup && (
              <div className="bg-blue-950/20 border border-blue-900/40 rounded-lg p-3 max-w-2xl">
                <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">
                  💡 Suggested Follow-ups
                </div>
                <ul className="list-disc list-inside space-y-1">
                  {turn.followup.followupQuestion.map((q, i) => (
                    <li key={i} className="text-sm text-zinc-300">
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 6. GLOBAL LOOKUP REFERENCES
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
      <div className="p-8 text-center text-zinc-600 animate-pulse">
        Loading transcript data...
      </div>
    );
  }

  return (
    // Root container: ensures base text is light for the black background
    <div className="p-6 text-zinc-200 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {mergedTurns.map((turn) => (
          <TranscriptBubble key={turn.ID} turn={turn} />
        ))}

        {/* Reference Footer */}
        {allLookupItems.length > 0 && (
          <div className="mt-16 pt-8 border-t border-zinc-800">
            <h3 className="text-xl font-bold text-zinc-100 mb-6">
              Context & References
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allLookupItems.map((item) => (
                <div
                  key={`ref-${item.turnId}-${item.index}`}
                  id={`lookup-${item.turnId}-${item.index}`}
                  className="bg-zinc-900 p-4 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <div className="font-semibold text-cyan-400 mb-1">
                    {item.term}
                  </div>
                  <div className="text-sm text-zinc-400 mb-3 leading-relaxed">
                    {item.explanation}
                  </div>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-500 hover:text-cyan-300 transition-colors flex items-center gap-1 truncate"
                  >
                    🔗 {item.link}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}