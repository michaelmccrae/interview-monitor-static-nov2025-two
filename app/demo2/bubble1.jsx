"use client";

import React, { useMemo } from "react";
import { speakerColors } from "../../lib/colorbubble";

export default function Display({ beforellm, afterllm }) {
  console.log(">>> CHILD beforellm PROP:", beforellm);
  console.log(">>> CHILD afterllm PROP:", afterllm);

  // Normalize helper for fuzzy matching
  function normalize(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, "") // strip punctuation
      .replace(/\s+/g, " ") // normalize spacing
      .trim();
  }

  function firstWords(str, count = 6) {
    return str.split(/\s+/).slice(0, count).join(" ");
  }

  // ===========================================================
  // 1. METADATA EXTRACTION
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
  // 2. MERGE
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
    return <div className="text-gray-500 p-4">Waiting for transcript data…</div>;
  }

  if (mergedMeta.turns.length === 0) {
    return <div className="text-gray-500 p-4">No turns available…</div>;
  }

  // ===========================================================
  //                   HIGHLIGHT ENGINE (NEW)
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
    const normalizedHaystack = normalize(text);

    // -------------------------
    // STEP 1 — FUZZY ERROR MATCHES (FIRST PRIORITY)
    // -------------------------
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

    // -------------------------
    // STEP 2 — LOOKUP MATCHES (ONLY IF NOT OVERLAPPING ERRORS)
    // -------------------------
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

    // -------------------------
    // STEP 3 — SORT BY RANGE + PRIORITY
    // -------------------------
    matches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.priority - b.priority;
    });

    // -------------------------
    // STEP 4 — BUILD SEGMENTS
    // -------------------------
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

    // -------------------------
    // STEP 5 — RENDER
    // -------------------------
    return out.map((seg, i) => {
      if (seg.type === "text") return seg.text;

      if (seg.type === "error") {
        return (
          <span
            key={`err-${turnId}-${i}`}
            className="bg-red-300 text-black px-1 rounded break-words"
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
            className="underline text-blue-600 font-semibold break-words"
          >
            {seg.text}
          </a>
        );
      }

      return seg.text;
    });
  }

  // ===========================================================
  // Supporting utilities
  // ===========================================================
  function getSpeakerLabel(turn, metadata) {
    const arr = metadata?.speakerName;
    if (!Array.isArray(arr) || !arr.length) return `Speaker ${turn.speaker}`;
    return arr[turn.speaker] ?? `Speaker ${turn.speaker}`;
  }

  function getSpeakerRole(turn, metadata) {
    const arr = metadata?.speakerRole;
    if (!Array.isArray(arr) || !arr.length) return "";
    const role = arr[turn.speaker];
    return role ? ` - ${role}` : "";
  }

  function firstFiveWords(text) {
    if (Array.isArray(text)) text = text[0];
    if (typeof text !== "string") return "";
    return text.split(/\s+/).slice(0, 5).join(" ") + "…";
  }


  

  // ===========================================================
  // Fuzzy Window Matcher
  // ===========================================================

function fuzzyFind(rawText, errorTerm) {
  const normHay = normalize(rawText).split(" ");
  const normNeed = normalize(errorTerm).split(" ");

  // window size for matching
  const W = Math.min(6, normNeed.length);

  const targetKey = normNeed.slice(0, W).join(" ");

  // sliding window over the haystack
  for (let i = 0; i <= normHay.length - W; i++) {
    const window = normHay.slice(i, i + W).join(" ");
    if (window === targetKey) {
      // reassemble the normalized window into raw text
      const rawLower = rawText.toLowerCase();
      const rawIndex = rawLower.indexOf(normNeed[0]); // best-effort

      if (rawIndex !== -1) {
        return {
          start: rawIndex,
          end: rawIndex + errorTerm.length,
          key: window,
        };
      }
    }
  }

  return null;
}





  // ===========================================================
  // Bubble Component
  // ===========================================================
  function TranscriptBubble({ turn }) {
    const alignment =
      turn.speaker % 2 === 0 ? "justify-start" : "justify-end";

    const roleRaw = getSpeakerRole(turn, mergedMeta.metadata);

    const errorList = Array.isArray(turn.error?.errorMatch)
      ? turn.error.errorMatch.filter((x) => typeof x === "string" && x.trim())
      : [];

    const showErrors = errorList.length > 0;

    const cleanRole = roleRaw.replace(/^ - /, "").trim().toLowerCase();

    const showFollowup =
      turn.followup &&
      turn.followup.followupQuestion &&
      cleanRole !== "interviewer";

    return (
      <div className={`flex ${alignment} w-full mb-2 px-4 lg:px-0`}>
        <div className="w-full max-w-full sm:max-w-3xl">
          <div
            className={`px-3 py-2 sm:px-4 sm:py-3 rounded-2xl border shadow-sm leading-relaxed break-words
              ${speakerColors[turn.speaker % speakerColors.length]}`}
          >
            <div className="font-semibold text-sm text-gray-700 mb-1 break-words">
              {getSpeakerLabel(turn, mergedMeta.metadata)}
              <span className="ml-1 text-gray-400 text-xs tracking-wide uppercase">
                {roleRaw}
              </span>
            </div>

            <div className="text-[15px] leading-relaxed break-words">
              {highlightTerms(
                turn.text,
                turn.lookup,
                turn.ID,
                turn.error?.errorMatch
              )}
            </div>
          </div>

          {/* ERROR + FOLLOWUP SECTION */}
<div className="mt-3 space-y-3">

  {/* ERROR SECTION */}
  {showErrors && (
    <div>
      <div className="font-bold mb-1">⚠️ Error</div>

      {errorList.map((match, i) => (
        <div key={i} className="text-sm leading-relaxed break-words">
          “{firstFiveWords(match)}” –{" "}
          {Array.isArray(turn.error.errorExplanation)
            ? turn.error.errorExplanation[i]
            : turn.error.errorExplanation}
        </div>
      ))}
    </div>
  )}

  {/* FOLLOW-UP SECTION */}
  {showFollowup && (
    <div>
      <div className="font-bold mb-1">💬 Follow-up</div>

      {turn.followup.followupQuestion.map((q, i) => (
        <div key={i} className="text-sm leading-relaxed break-words">
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
  // References section
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
    <div
      className="
        px-4 py-6 sm:px-6 sm:py-8
        max-w-screen-xl mx-auto
        break-words overflow-x-hidden
        space-y-10
        lg:flex lg:flex-col lg:items-center lg:gap-2
        lg:w-5/8
      "
    >
      {mergedMeta.turns.map((turn) => (
        <TranscriptBubble key={turn.ID} turn={turn} />
      ))}

      {allLookupItems.length > 0 && (
        <div className="border-t pt-10 space-y-6">
          <div className="text-lg font-semibold text-gray-800">
            References
          </div>

          <div className="space-y-6">
            {allLookupItems.map((item) => (
              <div
                key={`lk-${item.turnId}-${item.index}`}
                id={`lookup-${item.turnId}-${item.index}`}
                className="space-y-1 break-words"
              >
                <div className="text-gray-900 font-medium">{item.term}</div>
                <div className="text-gray-600 text-sm">{item.explanation}</div>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm break-all"
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
