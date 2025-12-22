"use client";

import React, { useMemo } from "react";
import { speakerColors } from "../../lib/colorbubble";

export default function Display({ beforellm, afterllm }) {
  // Normalize helper for fuzzy matching
  function normalize(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function firstWords(str, count = 6) {
    return str.split(/\s+/).slice(0, count).join(" ");
  }

  // ===========================================================
  // METADATA EXTRACTION
  // ===========================================================
  const extractedMetadata = useMemo(() => {
    if (!Array.isArray(afterllm)) return {};
    return (
      afterllm.find(
        (item) =>
          Array.isArray(item?.speakerName) &&
          Array.isArray(item?.speakerRole)
      ) || {}
    );
  }, [afterllm]);

  // ===========================================================
  // MERGE
  // ===========================================================
  const mergedTurns = useMemo(() => {
    if (!Array.isArray(beforellm) || !Array.isArray(afterllm)) return [];

    const map = new Map();
    for (const item of afterllm) {
      if (item?.ID != null) map.set(item.ID, item);
    }

    return beforellm.map((turn) => {
      const enrich = map.get(turn.ID) || {};
      return { ...turn, ...enrich };
    });
  }, [beforellm, afterllm]);

  const mergedMeta = useMemo(
    () => ({
      metadata: extractedMetadata,
      turns: mergedTurns,
    }),
    [extractedMetadata, mergedTurns]
  );

  if (!beforellm || !afterllm) {
    return (
      <div className="text-zinc-400 p-4">
        Waiting for transcript data…
      </div>
    );
  }

  if (mergedMeta.turns.length === 0) {
    return (
      <div className="text-zinc-400 p-4">
        No turns available…
      </div>
    );
  }

  console.log("mergedMeta", mergedMeta)

  // ===========================================================
  // HIGHLIGHT ENGINE (STYLE FIXED)
  // ===========================================================
  function highlightTerms(text, lookup, turnId, errorMatch) {
    if (!text || typeof text !== "string") return text;

    const errorTerms = Array.isArray(errorMatch)
      ? errorMatch.filter(Boolean)
      : errorMatch
      ? [errorMatch]
      : [];

    const lookupTerms = lookup?.lookupTerm || [];
    const matches = [];
    const raw = text;

    // ERROR MATCHES
    errorTerms.forEach((term) => {
      if (!term) return;
      const fuzzy = fuzzyFind(raw, term);
      if (fuzzy) {
        matches.push({
          type: "error",
          start: fuzzy.start,
          end: fuzzy.end,
          text: raw.slice(fuzzy.start, fuzzy.end),
          priority: 1,
        });
      }
    });

    // LOOKUP MATCHES
    lookupTerms.forEach((term) => {
      if (!term) return;
      const re = new RegExp(term, "gi");
      let m;
      while ((m = re.exec(raw)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        const overlapsError = matches.some(
          (err) =>
            err.type === "error" &&
            !(end <= err.start || start >= err.end)
        );
        if (!overlapsError) {
          matches.push({
            type: "lookup",
            start,
            end,
            text: m[0],
            needle: term,
            priority: 2,
          });
        }
      }
    });

    if (matches.length === 0) return raw;

    matches.sort((a, b) =>
      a.start !== b.start ? a.start - b.start : a.priority - b.priority
    );

    const out = [];
    let cursor = 0;

    for (const m of matches) {
      if (m.start > cursor) {
        out.push({ type: "text", text: raw.slice(cursor, m.start) });
      }
      out.push(m);
      cursor = m.end;
    }
    if (cursor < raw.length) {
      out.push({ type: "text", text: raw.slice(cursor) });
    }

    return out.map((seg, i) => {
      if (seg.type === "text") return seg.text;

      if (seg.type === "error") {
        return (
          <span
            key={`err-${turnId}-${i}`}
            className="bg-amber-400/30 text-amber-200 px-1 rounded break-words"
          >
            {seg.text}
          </span>
        );
      }

      if (seg.type === "lookup") {
        const index = lookupTerms.indexOf(seg.needle);
        return (
          <a
            key={`lk-${turnId}-${i}`}
            href={`#lookup-${turnId}-${index}`}
            className="underline text-blue-400 font-medium break-words hover:text-blue-300"
          >
            {seg.text}
          </a>
        );
      }

      return seg.text;
    });
  }

  // ===========================================================
  // SUPPORTING UTILS
  // ===========================================================
  function getSpeakerLabel(turn, metadata) {
    const arr = metadata?.speakerName;
    return Array.isArray(arr) && arr.length
      ? arr[turn.speaker] ?? `Speaker ${turn.speaker}`
      : `Speaker ${turn.speaker}`;
  }

  function getSpeakerRole(turn, metadata) {
    const arr = metadata?.speakerRole;
    const role = Array.isArray(arr) ? arr[turn.speaker] : "";
    return role ? ` - ${role}` : "";
  }

  function firstFiveWords(text) {
    if (Array.isArray(text)) text = text[0];
    if (typeof text !== "string") return "";
    return text.split(/\s+/).slice(0, 5).join(" ") + "…";
  }

  // ===========================================================
  // FUZZY MATCH
  // ===========================================================
  function fuzzyFind(rawText, errorTerm) {
    const normHay = normalize(rawText).split(" ");
    const normNeed = normalize(errorTerm).split(" ");
    const W = Math.min(6, normNeed.length);
    const targetKey = normNeed.slice(0, W).join(" ");

    for (let i = 0; i <= normHay.length - W; i++) {
      const window = normHay.slice(i, i + W).join(" ");
      if (window === targetKey) {
        const rawIndex = rawText.toLowerCase().indexOf(normNeed[0]);
        if (rawIndex !== -1) {
          return {
            start: rawIndex,
            end: rawIndex + errorTerm.length,
          };
        }
      }
    }
    return null;
  }

  // ===========================================================
  // TRANSCRIPT BUBBLE (DARK THEME FIXED)
  // ===========================================================
  function TranscriptBubble({ turn }) {
    const alignment =
      turn.speaker % 2 === 0 ? "justify-start" : "justify-end";

    const roleRaw = getSpeakerRole(turn, mergedMeta.metadata);
    const errorList = Array.isArray(turn.error?.errorMatch)
      ? turn.error.errorMatch.filter(Boolean)
      : [];
    const showFollowup =
      turn.followup?.followupQuestion &&
      roleRaw.replace(/^ - /, "").toLowerCase() !== "interviewer";

    return (
      <div className={`flex ${alignment} w-full mb-4 px-4 lg:px-0`}>
        <div className="w-full sm:max-w-3xl">
          <div
            className={`px-4 py-3 rounded-2xl border border-zinc-700 shadow-sm
              leading-relaxed break-words
              ${speakerColors[turn.speaker % speakerColors.length]}`}
          >
            <div className="font-semibold text-sm text-zinc-200 mb-1">
              {getSpeakerLabel(turn, mergedMeta.metadata)}
              <span className="ml-2 text-xs uppercase tracking-wide text-zinc-400">
                {roleRaw}
              </span>
            </div>

            <div className="text-[15px] text-zinc-100 leading-relaxed">
              {highlightTerms(
                turn.text,
                turn.lookup,
                turn.ID,
                turn.error?.errorMatch
              )}
            </div>
          </div>

          {/* ERROR + FOLLOWUP */}
          <div className="mt-3 space-y-3 text-sm">
            {errorList.length > 0 && (
              <div>
                <div className="font-semibold text-amber-300 mb-1">
                  Error
                </div>
                {errorList.map((match, i) => (
                  <div key={i} className="text-zinc-300">
                    “{firstFiveWords(match)}” —{" "}
                    {Array.isArray(turn.error.errorExplanation)
                      ? turn.error.errorExplanation[i]
                      : turn.error.errorExplanation}
                  </div>
                ))}
              </div>
            )}

            {showFollowup && (
              <div>
                <div className="font-semibold text-blue-300 mb-1">
                  Follow-up
                </div>
                {turn.followup.followupQuestion.map((q, i) => (
                  <div key={i} className="text-zinc-300">
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

  // ===========================================================
  // REFERENCES (DARK FIX)
  // ===========================================================
  const allLookupItems = mergedMeta.turns.flatMap((turn) => {
    const arr = turn.lookup?.lookupTerm;
    if (!Array.isArray(arr)) return [];
    return arr.map((term, i) => ({
      turnId: turn.ID,
      term,
      explanation: turn.lookup.lookupExplanation?.[i] || "",
      link: turn.lookup.lookupLink?.[i] || "",
      index: i,
    }));
  });

  return (
    <div className="px-4 py-8 max-w-screen-xl mx-auto space-y-10">
      {mergedMeta.turns.map((turn) => (
        <TranscriptBubble key={turn.ID} turn={turn} />
      ))}

      {allLookupItems.length > 0 && (
        <div className="border-t border-zinc-700 pt-10 space-y-6">
          <div className="text-lg font-semibold text-zinc-200">
            References
          </div>

          {allLookupItems.map((item) => (
            <div
              key={`lk-${item.turnId}-${item.index}`}
              id={`lookup-${item.turnId}-${item.index}`}
              className="space-y-1"
            >
              <div className="font-medium text-zinc-100">
                {item.term}
              </div>
              <div className="text-sm text-zinc-400">
                {item.explanation}
              </div>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-sm break-all"
              >
                {item.link}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
