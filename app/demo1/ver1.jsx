import React, { useMemo } from "react";
import beforeLLM from "../../lib/data/beforeLLM.json";
import afterLLM from "../../lib/data/afterLLM.json";
import metadata from "../../lib/data/metadata.json";
import reactStringReplace from "react-string-replace";
import { speakerColors } from "../../lib/colorbubble";

export default function Page() {
  // ---- JOIN LOGIC ----
  const merged = useMemo(() => {
    const afterMap = new Map();
    afterLLM.forEach((item) => afterMap.set(item.ID, item));

    return beforeLLM.map((turn) => {
      const after = afterMap.get(turn.ID) || {};
      return { ...turn, ...after };
    });
  }, []);

  const mergedMeta = useMemo(() => {
    return { metadata, turns: merged };
  }, [merged]);

  // ---- SPEAKER NAME ----
  function getSpeakerLabel(turn, metadata) {
    if (!metadata) return `Speaker ${turn.speaker}`;
    const names = metadata.speakerName;
    if (!Array.isArray(names) || names.length === 0)
      return `Speaker ${turn.speaker}`;
    return names[turn.speaker] || `Speaker ${turn.speaker}`;
  }

  // ---- SPEAKER ROLE ----
  function getSpeakerRole(turn, metadata) {
    if (!metadata) return "";
    const roles = metadata.speakerRole;
    if (!Array.isArray(roles) || roles.length === 0) return "";
    const role = roles[turn.speaker];
    return role ? ` - ${role}` : "";
  }

  // ---- HIGHLIGHT TERMS (Segment-Based, No Overlap) ----
  let globalKeyCounter = 0;

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
            className="bg-red-300 text-black px-1 rounded"
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
            className="underline text-blue-600 font-semibold"
          >
            {seg.text}
          </a>
        );
      }

      return seg.text;
    });
  }

  // ---- FIRST FIVE WORDS ----
  function firstFiveWords(text) {
    if (Array.isArray(text)) text = text[0];
    if (typeof text !== "string") return "";
    return text.split(/\s+/).slice(0, 5).join(" ") + "…";
  }

  // ---- BUBBLE + META COMPONENT ----
  function TranscriptBubble({ turn }) {
    // Alternate left/right like an LLM chat
    const bubbleAlignment =
      turn.speaker % 2 === 0 ? "justify-start" : "justify-end";

    const roleRaw = getSpeakerRole(turn, mergedMeta.metadata);
    const cleanRole = roleRaw.replace(/^ - /, "").trim().toLowerCase();

    // Clean errors
    const rawErrorMatch = turn.error?.errorMatch;
    const cleanErrors = Array.isArray(rawErrorMatch)
      ? rawErrorMatch.filter(
          (x) => typeof x === "string" && x.trim().length > 0
        )
      : [];

    const hasErrors = cleanErrors.length > 0;

    const showFollowup =
      turn.followup &&
      turn.followup.followupQuestion &&
      cleanRole !== "interviewer";

    return (
      <div className={`mb-4 flex ${bubbleAlignment}`}>
        <div className="max-w-3xl w-fit">
          {/* Bubble */}
          <div
            className={`px-4 py-3 rounded-2xl border shadow-sm leading-relaxed 
              ${speakerColors[turn.speaker % speakerColors.length]}`}
          >
            <div className="font-semibold text-sm text-gray-700 mb-1">
              {getSpeakerLabel(turn, mergedMeta.metadata)}
              <span className="ml-1 text-gray-400 text-xs tracking-wide uppercase">
                {roleRaw}
              </span>
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

          {/* Meta directly under bubble, same horizontal alignment */}
          <div className="mt-2 space-y-2">
            {/* ERROR */}
            {hasErrors && (
              <div>
                <div className="font-bold mb-1">⚠️ Error</div>
                {cleanErrors.map((match, i) => (
                  <div key={i} className="text-sm leading-relaxed">
                    “{firstFiveWords(match)}” –{" "}
                    {Array.isArray(turn.error.errorExplanation)
                      ? turn.error.errorExplanation[i]
                      : turn.error.errorExplanation}
                  </div>
                ))}
              </div>
            )}

            {/* FOLLOWUP */}
            {showFollowup && (
              <div>
                <div className="font-bold mb-1">💬 Follow-up</div>
                {turn.followup.followupQuestion.map((q, i) => (
                  <div key={i} className="text-sm leading-relaxed">
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

  // ---- LOOKUP ITEMS ----
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
    <div className="p-6 space-y-6">
      {mergedMeta.turns.map((turn) => (
        <div key={turn.ID}>
          <TranscriptBubble turn={turn} />
        </div>
      ))}

     {/* ---- GLOBAL LOOKUP ---- */}
        {allLookupItems.length > 0 && (
          <div className="mt-12 space-y-6 border-t pt-8 border-gray-300">
            <div className="text-lg font-semibold text-gray-800">
              References
            </div>

            <div className="space-y-4">
              {allLookupItems.map((item) => (
                <div
                  key={`all-lookup-${item.turnId}-${item.index}`}
                  id={`lookup-${item.turnId}-${item.index}`}
                  className="space-y-1"
                >
                  {/* Term */}
                  <div className="text-gray-900 font-medium">{item.term}</div>

                  {/* Explanation */}
                  <div className="text-gray-600 text-sm">
                    {item.explanation}
                  </div>

                  {/* Link */}
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
