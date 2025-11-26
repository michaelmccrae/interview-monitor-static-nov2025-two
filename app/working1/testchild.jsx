"use client";
import React, { useMemo } from "react";
import reactStringReplace from "react-string-replace";
import { speakerColors } from "../../lib/colorbubble";

export default function TestChild({ beforeLLM, afterLLM }) {
  // ============================================================
  // 1. EXTRACT METADATA AND TURN-LEVEL ENRICHMENT (lookup/error/followup)
  // ============================================================
  const { metadata, turnMap } = useMemo(() => {
    let meta = null;
    const map = new Map();

    if (Array.isArray(afterLLM)) {
      for (const item of afterLLM) {
        // Speaker metadata block
        if (item?.speakerName && item?.speakerRole) {
          meta = item;
        }

        // Turn-level metadata (lookup/error/followup)
        else if (item?.ID != null) {
          map.set(item.ID, item);
        }
      }
    }

    return { metadata: meta, turnMap: map };
  }, [afterLLM]);

  // ============================================================
  // 2. MERGE: beforeLLM (the real turns) + afterLLM enrichment
  // ============================================================
  const mergedTurns = useMemo(() => {
    if (!Array.isArray(beforeLLM)) return [];

    return beforeLLM.map((turn) => {
      const enrich = turnMap.get(turn.ID) || {};
      return { ...turn, ...enrich };
    });
  }, [beforeLLM, turnMap]);

  // ============================================================
  // 3. UTILITIES: speaker name + speaker role
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
  // 4. TERM HIGHLIGHTING (lookup + errors)
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

      if (seg.type === "error") {
        return (
          <span key={`err-${turnId}-${i}`} className="bg-red-300 px-1 rounded">
            {seg.text}
          </span>
        );
      }

      if (seg.type === "lookup") {
        const index = lookups.indexOf(seg.needle);
        return (
          <a
            key={`lk-${turnId}-${i}`}
            href={`#lookup-${turnId}-${index}`}
            className="text-blue-600 underline"
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

    return (
      <div
        className={`flex ${
          turn.speaker % 2 === 0 ? "justify-start" : "justify-end"
        } mb-4`}
      >
        <div className="max-w-3xl">
          {/* Bubble */}
          <div
            className={`px-4 py-3 border rounded-2xl shadow-sm ${
              speakerColors[turn.speaker % speakerColors.length]
            }`}
          >
            <div className="font-semibold text-sm text-gray-800">
              {getSpeakerLabel(turn)}
              <span className="text-xs text-gray-500 ml-1">{roleRaw}</span>
            </div>

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
          <div className="mt-2 space-y-2">
            {/* Errors */}
            {cleanErrors.length > 0 && (
              <div>
                <div className="font-bold mb-1">⚠️ Error</div>
                {cleanErrors.map((err, i) => (
                  <div key={i} className="text-sm">
                    “{firstFiveWords(err)}” –{" "}
                    {Array.isArray(turn.error?.errorExplanation)
                      ? turn.error.errorExplanation[i]
                      : turn.error?.errorExplanation}
                  </div>
                ))}
              </div>
            )}

            {/* Follow-up */}
            {showFollowup && (
              <div>
                <div className="font-bold mb-1">💬 Follow-up</div>
                {turn.followup.followupQuestion.map((q, i) => (
                  <div key={i} className="text-sm">
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
    return <div className="p-4 text-gray-400">Waiting for transcript…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {mergedTurns.map((turn) => (
        <TranscriptBubble key={turn.ID} turn={turn} />
      ))}

      {/* References */}
      {allLookupItems.length > 0 && (
        <div className="mt-12 border-t pt-6">
          <div className="text-lg font-semibold mb-4">References</div>
          <div className="space-y-4">
            {allLookupItems.map((item) => (
              <div
                key={`ref-${item.turnId}-${item.index}`}
                id={`lookup-${item.turnId}-${item.index}`}
              >
                <div className="font-medium">{item.term}</div>
                <div className="text-sm text-gray-600">{item.explanation}</div>
                <a
                  href={item.link}
                  target="_blank"
                  className="text-blue-600 underline text-sm break-all"
                >
                  {item.link}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
