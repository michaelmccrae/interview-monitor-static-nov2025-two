"use client";

import React, { useMemo, useState } from "react";
import { titleCase } from "title-case";

// Dark-mode safe speaker badges
const speakerBgColors = [
  "bg-zinc-800 text-zinc-100 border-zinc-700",
  "bg-blue-900/40 text-blue-100 border-blue-700",
  "bg-purple-900/40 text-purple-100 border-purple-700",
  "bg-emerald-900/40 text-emerald-100 border-emerald-700",
  "bg-amber-900/40 text-amber-100 border-amber-700",
  "bg-pink-900/40 text-pink-100 border-pink-700"
];


// ─── HELPERS ─────────────────────────────────────────────

function firstFiveWords(str) {
  if (!str) return "";
  return str.split(" ").slice(0, 5).join(" ");
}

function formatHMS(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function formatSeconds(seconds) {
  if (seconds == null) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}

function getSpeakerLabel(merged, speakerIndex) {
  const name = merged.metadata?.speakerName?.[speakerIndex];
  const role = merged.metadata?.speakerRole?.[speakerIndex];
  return [name, role].filter(Boolean).join(" · ");
}

function getDurationSeconds(turn) {
  if (
    typeof turn.startBeginning !== "number" ||
    typeof turn.startEnd !== "number"
  ) {
    return 0;
  }
  return Math.max(0, turn.startEnd - turn.startBeginning);
}

function hasAnnotations(turn) {
  const hasLookup =
    Array.isArray(turn.lookup?.lookupTerm) &&
    turn.lookup.lookupTerm.length > 0;

  const hasError =
    Array.isArray(turn.error?.errorMatch) &&
    turn.error.errorMatch.length > 0;

  const hasFollowup =
    Array.isArray(turn.followup?.followupQuestion) &&
    turn.followup.followupQuestion.length > 0;

  return hasLookup || hasError || hasFollowup;
}

function clampPct(value) {
  return Math.max(0, Math.min(100, value));
}

// ─── COMPONENT ───────────────────────────────────────────

export default function TranscriptMerger({ beforellm, afterllm }) {
    const [selectedLookup, setSelectedLookup] = useState(null);
// shape: { turnID, index }

  
  // 1. MERGE LOGIC (Required to combine the props)
  const merged = useMemo(() => {
  const beforeArr = Array.isArray(beforellm)
    ? beforellm
    : beforellm?.turns || [];

  const afterArr = Array.isArray(afterllm)
    ? afterllm
    : afterllm?.turns || [];

  if (beforeArr.length === 0 || afterArr.length === 0) {
    return { turns: [], metadata: {} };
  }

  // 1. Extract metadata object from afterLLM array
  const metadata =
    afterArr.find(
      (item) =>
        item &&
        Array.isArray(item.speakerName) &&
        Array.isArray(item.speakerRole)
    ) || {};

  // 2. Index annotation turns by ID
  const map = new Map();
  for (const item of afterArr) {
    if (item?.ID != null) {
      map.set(item.ID, item);
    }
  }

  // 3. Merge before + after by ID
  const mergedTurns = beforeArr.map((turn) => {
    const enrich = map.get(turn.ID) || {};
    return { ...turn, ...enrich };
  });

  return {
    metadata,
    turns: mergedTurns
  };
}, [beforellm, afterllm]);



  // 2. FILTER & SORT
  const items = (merged.turns ?? [])
    .filter((turn) => typeof turn.ID === "number")
    .filter(hasAnnotations) 
    .sort((a, b) => b.ID - a.ID); // Kept your original Descending sort (b - a)

  const durations = items.map(getDurationSeconds);
  const maxDuration = Math.max(...durations, 1); 


  // 3. LOADING STATE
  if (!beforellm || !afterllm) {
    return <div className="text-zinc-400 p-4">Waiting for transcript data…</div>;
  }

  if (items.length === 0) {
    return <div className="text-zinc-400 p-4">No turns available…</div>;
  }

  console.log("items merged", items)

  // 4. RENDER (Using your EXACT original styling)
  return (
    <div className="bg-zinc-900 p-6 text-zinc-100">
      {items.map((item, index) => {
        const speakerLabel = getSpeakerLabel(merged, item.speaker);
        const timeRange = `${formatSeconds(item.startBeginning)} → ${formatSeconds(item.startEnd)}`;
        const duration = getDurationSeconds(item);

        const fillPct = clampPct((duration / maxDuration) * 100);

        return (
          <React.Fragment key={item.ID}>
            <div className="space-y-3">

              {/* Speaker + timing */}
              <div className={`inline-flex flex-wrap items-center gap-2 px-3 py-1 rounded border text-xs ${speakerBgColors[item.speaker % speakerBgColors.length]  }`}
>
            <span className="font-medium">{speakerLabel}</span>
            <span className="opacity-60">|</span>
            <span className="opacity-80">{timeRange}</span>
            <span className="opacity-60">|</span>
            <span className="opacity-80">{duration.toFixed(1)}s</span>
            </div>


              {/* Duration bar (0 → max) */}
              <div className="relative w-64 h-2 bg-zinc-700 rounded overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-2 bg-blue-400"
                  style={{ width: `${fillPct}%` }}
                />
              </div>

              {/* Lookup terms */}
{Array.isArray(item.lookup?.lookupTerm) &&
  item.lookup.lookupTerm.length > 0 && (
    <div className="mt-3 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Terminology Lookup
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap gap-2">
        {item.lookup.lookupTerm.map((term, i) => {
          const isActive =
            selectedLookup?.turnID === item.ID &&
            selectedLookup?.index === i;

          return (
            <button
              key={i}
              onClick={() =>
                setSelectedLookup((prev) =>
                  prev?.turnID === item.ID && prev?.index === i
                    ? null
                    : { turnID: item.ID, index: i }
                )
              }
              className={
                "px-3 py-1 text-sm border transition " +
                (isActive
                  ? "bg-blue-500/20 border-blue-400 text-blue-200"
                  : "border-zinc-600 text-zinc-300 hover:bg-zinc-700")
              }
            >
              {titleCase(term)}
            </button>
          );
        })}
      </div>

      {/* Selected lookup details */}
      {selectedLookup?.turnID === item.ID && (
        <div className="rounded border border-zinc-700 bg-zinc-800 p-3 text-sm">
          <div className="mb-1 font-medium text-zinc-200">
            {titleCase(
              item.lookup.lookupTerm[selectedLookup.index]
            )}
          </div>

          <div className="text-zinc-400">
            {item.lookup.lookupExplanation?.[selectedLookup.index]}

            {item.lookup.lookupLink?.[selectedLookup.index] && (
              <>
                {" "}
                <a
                  href={item.lookup.lookupLink[selectedLookup.index]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  source
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
)}



            {/* Errors */}
{Array.isArray(item.error?.errorMatch) &&
 item.error.errorMatch.length > 0 ? (

  <div className="mt-3 space-y-1">
    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
      Errors and Clarifications
    </div>

    <div className="space-y-0.5">
      {item.error.errorMatch.map((match, i) => (
        <div
          key={i}
          className="text-sm text-zinc-200 leading-snug"
        >
          <span className="font-semibold text-amber-300">
            “{firstFiveWords(match)}…”
          </span>
          <span className="text-zinc-400">
            {" "}— {item.error.errorExplanation?.[i]}
          </span>
        </div>
      ))}
    </div>
  </div>

) : (
  <div className="text-xs italic text-zinc-400">
    No errors or clarifications detected
  </div>
)}



             {/* Follow-up questions */}
{Array.isArray(item.followup?.followupQuestion) &&
  item.followup.followupQuestion.length > 0 && (
    <div className="mt-3 space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Suggested Follow Up Questions
      </div>

      <ul className="list-disc list-inside space-y-1 text-sm text-zinc-300">
        {item.followup.followupQuestion.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ul>
    </div>
)}


            </div>

            {index < items.length - 1 && (
              <hr className="my-6 border-zinc-700" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}