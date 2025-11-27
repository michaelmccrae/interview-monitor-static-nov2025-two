import React, { useMemo } from "react";
import beforeLLM from "../../lib/data2/goldman1/beforellm.json";
import afterLLM from "../../lib/data2/goldman1/afterllm.json";
// import reactStringReplace from "react-string-replace";
import { speakerColors } from "../../lib/colorbubble";

export default function Page() {
  // ------------------------------------------
  // 1. EXTRACT METADATA FROM afterLLM
  // ------------------------------------------
  const metadataFromAfter = useMemo(() => {
    return afterLLM.find(
      (item) =>
        item.speakerName ||
        item.speakerRole ||
        item.metadata === "speaker name and speaker role"
    ) || {};
  }, []);

  // ------------------------------------------
  // 2. BUILD TURN MAP FROM afterLLM (ONLY ID ITEMS)
  // ------------------------------------------
  const afterTurnsOnly = useMemo(() => {
    return afterLLM.filter((item) => typeof item.ID === "number");
  }, []);

  // ------------------------------------------
  // 3. MERGE beforeLLM + afterLLM TURN OBJECTS
  // ------------------------------------------
  const mergedTurns = useMemo(() => {
    const afterMap = new Map();
    afterTurnsOnly.forEach((item) => afterMap.set(item.ID, item));

    return beforeLLM.map((turn) => {
      const after = afterMap.get(turn.ID) || {};
      return { ...turn, ...after };
    });
  }, [afterTurnsOnly]);

  // ------------------------------------------
  // 4. COMBINED STRUCTURE NOW USES NEW METADATA SOURCE
  // ------------------------------------------
  const mergedMeta = useMemo(() => {
    return {
      metadata: metadataFromAfter,
      turns: mergedTurns,
    };
  }, [metadataFromAfter, mergedTurns]);

  // ------------------------------------------
  // 5. SPEAKER NAME
  // ------------------------------------------
  function getSpeakerLabel(turn, metadata) {
    if (!metadata) return `Speaker ${turn.speaker}`;
    const names = metadata.speakerName;
    if (!Array.isArray(names) || names.length === 0)
      return `Speaker ${turn.speaker}`;
    return names[turn.speaker] || `Speaker ${turn.speaker}`;
  }

  // ------------------------------------------
  // 6. SPEAKER ROLE
  // ------------------------------------------
  function getSpeakerRole(turn, metadata) {
    if (!metadata) return "";
    const roles = metadata.speakerRole;
    if (!Array.isArray(roles) || roles.length === 0) return "";
    const role = roles[turn.speaker];
    return role ? ` - ${role}` : "";
  }

  // ------------------------------------------
  // 7. HIGHLIGHT TERMS (unchanged)
  // ------------------------------------------
  function highlightTerms(text, lookup, turnId, errorMatch) {
    if (!text || typeof text !== "string") return text;

    const errors = Array.isArray(errorMatch)
      ? errorMatch.filter(Boolean)
      : errorMatch
      ? [errorMatch]
      : [];

    const lookups = lookup?.lookupTerm || [];
    const matches = [];

    function findAll(haystack, needle, type) {
      if (!needle || typeof needle !== "string") return;
      const regex = new RegExp(needle, "gi");
      let m;
      while ((m = regex.exec(haystack)) !== null) {
        matches.push({
          type,
          start: m.index,
          end: m.index + m[0].length,
          text: m[0],
          needle,
        });
      }
    }

    errors.forEach((err) => findAll(text, err, "error"));
    lookups.forEach((term) => findAll(text, term, "lookup"));

    if (matches.length === 0) return text;

    matches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.type === "error" && b.type === "lookup") return -1;
      if (a.type === "lookup" && b.type === "error") return 1;
      return 0;
    });

    const segments = [];
    let cursor = 0;

    for (const m of matches) {
      if (m.start < cursor) continue;
      if (m.start > cursor) {
        segments.push({ type: "text", text: text.slice(cursor, m.start) });
      }
      segments.push({
        type: m.type,
        text: text.slice(m.start, m.end),
        needle: m.needle,
      });
      cursor = m.end;
    }

    if (cursor < text.length) {
      segments.push({ type: "text", text: text.slice(cursor) });
    }

    return segments.map((seg, i) => {
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
        const index = lookups.indexOf(seg.needle);
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

  // ------------------------------------------
  // 8. FIRST FIVE WORDS
  // ------------------------------------------
  function firstFiveWords(text) {
    if (Array.isArray(text)) text = text[0];
    if (typeof text !== "string") return "";
    return text.split(/\s+/).slice(0, 5).join(" ") + "…";
  }

  // ------------------------------------------
  // 9. TRANSCRIPT BUBBLE (unchanged except metadata source)
  // ------------------------------------------
  function TranscriptBubble({ turn }) {
    const alignment =
      turn.speaker % 2 === 0 ? "justify-start" : "justify-end";

    const roleRaw = getSpeakerRole(turn, mergedMeta.metadata);
    const cleanRole = roleRaw.replace(/^ - /, "").trim().toLowerCase();

    const rawError = turn.error?.errorMatch;
    const cleanErrors = Array.isArray(rawError)
      ? rawError.filter((x) => typeof x === "string" && x.trim())
      : [];

    const hasErrors = cleanErrors.length > 0;

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

          {/* META */}
          <div className="mt-3 space-y-3">
            {hasErrors && (
              <div>
                <div className="font-bold mb-1">⚠️ Error</div>
                {cleanErrors.map((match, i) => (
                  <div key={i} className="text-sm leading-relaxed break-words">
                    “{firstFiveWords(match)}” –{" "}
                    {Array.isArray(turn.error.errorExplanation)
                      ? turn.error.errorExplanation[i]
                      : turn.error.errorExplanation}
                  </div>
                ))}
              </div>
            )}

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

  // ------------------------------------------
  // 10. GLOBAL LOOKUP LIST (unchanged)
  // ------------------------------------------
  const allLookupItems = mergedMeta.turns.flatMap((turn) => {
    if (!turn.lookup || !Array.isArray(turn.lookup.lookupTerm)) return [];
    return turn.lookup.lookupTerm.map((term, i) => ({
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
        px-4 py-6
        sm:px-6 sm:py-8
        max-w-screen-xl mx-auto
        break-words overflow-x-hidden
        space-y-10
        lg:flex
        lg:flex-col
        lg:items-center
        lg:gap-2
        lg:w-5/8
      "
    >
      {mergedMeta.turns.map((turn) => (
        <TranscriptBubble key={turn.ID} turn={turn} />
      ))}

      {allLookupItems.length > 0 && (
        <div className="border-t pt-10 space-y-6">
          <div className="text-lg font-semibold text-gray-800">References</div>

          <div className="space-y-6">
            {allLookupItems.map((item) => (
              <div
                key={`all-lookup-${item.turnId}-${item.index}`}
                id={`lookup-${item.turnId}-${item.index}`}
                className="space-y-1 break-words"
              >
                <div className="text-gray-900 font-medium">{item.term}</div>

                <div className="text-gray-600 text-sm">
                  {item.explanation}
                </div>

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
