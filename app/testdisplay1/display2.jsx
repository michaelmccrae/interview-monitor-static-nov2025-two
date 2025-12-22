"use client";

import React from "react";
import merged from "./mergedmeta.json";
import { titleCase } from "title-case";

// ─── helpers ─────────────────────────────────────────────
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

// ─── component ───────────────────────────────────────────
export default function LookupList() {
  const items = (merged.turns ?? [])
    .filter((turn) => typeof turn.ID === "number")
    .filter(hasAnnotations)
    .sort((a, b) => b.ID - a.ID);

  const durations = items.map(getDurationSeconds);
  const maxDuration = Math.max(...durations, 1); // avoid divide-by-zero

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
              <div className="text-xs text-zinc-400 flex flex-wrap gap-2">
                <span>{speakerLabel}</span>
                <span>|</span>
                <span>{timeRange}</span>
                <span>|</span>
                <span>{duration.toFixed(1)}s</span>
              </div>

              {/* Duration bar (0 → max) */}
              <div className="relative w-64 h-2 bg-zinc-700 rounded overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-2 bg-blue-400"
                  style={{ width: `${fillPct}%` }}
                />
              </div>

              {/* Lookup terms */}
              {item.lookup?.lookupTerm?.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  {item.lookup.lookupTerm.map((term, i) => (
                    <button
                      key={i}
                      className="border border-blue-400 px-3 py-1 text-sm font-medium text-blue-300 hover:bg-blue-400/10 transition"
                    >
                      {titleCase(term)}
                    </button>
                  ))}
                </div>
              )}

              {/* Errors */}
              {Array.isArray(item.error?.errorMatch) &&
                Array.isArray(item.error?.errorExplanation) &&
                item.error.errorMatch.map((match, i) => (
                  <div
                    key={i}
                    className="text-sm text-zinc-200 leading-relaxed"
                  >
                    <span className="font-semibold text-amber-300">
                      “{firstFiveWords(match)}…”
                    </span>
                    <span className="text-zinc-400">
                      {" "}— {item.error.errorExplanation?.[i]}
                    </span>
                  </div>
                ))}

              {/* Follow-ups */}
              {Array.isArray(item.followup?.followupQuestion) &&
                item.followup.followupQuestion.map((q, i) => (
                  <div key={i} className="text-sm text-zinc-300">
                    {q}
                    {item.followup.followupQuestionTimestamp && (
                      <span className="ml-2 text-xs text-zinc-500">
                        {formatHMS(item.followup.followupQuestionTimestamp)}
                      </span>
                    )}
                  </div>
                ))}
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
