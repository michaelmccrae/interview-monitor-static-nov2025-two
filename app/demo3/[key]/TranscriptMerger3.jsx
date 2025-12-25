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

function formatSeconds(seconds) {
  if (seconds == null) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}

function getSpeakerLabelParts(merged, speakerIndex) {
  const name = merged.metadata?.speakerName?.[speakerIndex];
  const role = merged.metadata?.speakerRole?.[speakerIndex];

  return {
    name,
    role: role ? role.toUpperCase() : null
  };
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
  return (
    (turn.lookup?.lookupTerm?.length ?? 0) > 0 ||
    (turn.error?.errorMatch?.length ?? 0) > 0 ||
    (turn.followup?.followupQuestion?.length ?? 0) > 0
  );
}

function clampPct(value) {
  return Math.max(0, Math.min(100, value));
}

// ─── COMPONENT ───────────────────────────────────────────

export default function TranscriptMerger({ beforellm, afterllm }) {
  const [selectedLookup, setSelectedLookup] = useState(null);

  // ─── MERGE ─────────────────────────────────────────────
  const merged = useMemo(() => {
    const beforeArr = Array.isArray(beforellm)
      ? beforellm
      : beforellm?.turns || [];

    const afterArr = Array.isArray(afterllm)
      ? afterllm
      : afterllm?.turns || [];

    if (!beforeArr.length || !afterArr.length) {
      return { turns: [], metadata: {} };
    }

    const metadata =
      afterArr.find(
        (item) =>
          item &&
          Array.isArray(item.speakerName) &&
          Array.isArray(item.speakerRole)
      ) || {};

    const map = new Map();
    afterArr.forEach((item) => {
      if (item?.ID != null) map.set(item.ID, item);
    });

    return {
      metadata,
      turns: beforeArr.map((turn) => ({
        ...turn,
        ...(map.get(turn.ID) || {})
      }))
    };
  }, [beforellm, afterllm]);

  const items = merged.turns
    .filter((t) => typeof t.ID === "number")
    .filter(hasAnnotations)
    .sort((a, b) => b.ID - a.ID);

  const maxDuration = Math.max(
    ...items.map(getDurationSeconds),
    1
  );

  if (!beforellm || !afterllm) {
    return (
      <div className="p-6 text-sm text-zinc-400">
        Waiting for transcript data…
      </div>
    );
  }

  // ─── RENDER ────────────────────────────────────────────
  return (
    <div className="bg-zinc-900 text-zinc-100 px-4 sm:px-6 py-8 space-y-8">
      {items.map((item, index) => {
        const { name, role } = getSpeakerLabelParts(merged, item.speaker);
        const duration = getDurationSeconds(item);
        const fillPct = clampPct((duration / maxDuration) * 100);

        return (
          <section
            key={item.ID}
            className="max-w-3xl mx-auto space-y-6"
          >
            {/* Speaker Header */}
            <div className={`inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${speakerBgColors[item.speaker % speakerBgColors.length]}`}
>
            {name && <span className="font-medium">{name}</span>}

            {role && (
                <>
                <span className="opacity-50">·</span>
                <span className="tracking-wide opacity-90">{role}</span>
                </>
            )}

            <span className="opacity-50">·</span>
            <span className="opacity-80">
                {formatSeconds(item.startBeginning)} → {formatSeconds(item.startEnd)}
            </span>

            <span className="opacity-50">·</span>
            <span className="opacity-80">{duration.toFixed(1)}s</span>
            </div>


            {/* Duration Bar */}
            <div className="w-full h-2 rounded bg-zinc-700 overflow-hidden">
              <div
                className="h-2 bg-blue-400"
                style={{ width: `${fillPct}%` }}
              />
            </div>

            {/* 📘 Terminology */}
            {item.lookup?.lookupTerm?.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  📘 Terminology
                </h3>

                <div className="flex flex-wrap gap-2">
                  {item.lookup.lookupTerm.map((term, i) => {
                    const isActive =
                      selectedLookup?.turnID === item.ID &&
                      selectedLookup?.index === i;

                    return (
                      <button
                        key={i}
                        onClick={() =>
                          setSelectedLookup(
                            isActive
                              ? null
                              : { turnID: item.ID, index: i }
                          )
                        }
                        className={`px-3 py-1.5 text-sm rounded-md border transition ${
                          isActive
                            ? "bg-blue-500/20 border-blue-400 text-blue-200"
                            : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {titleCase(term)}
                      </button>
                    );
                  })}
                </div>

                {selectedLookup?.turnID === item.ID && (
                  <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 text-sm space-y-1">
                    <div className="font-medium text-zinc-200">
                      {titleCase(
                        item.lookup.lookupTerm[selectedLookup.index]
                      )}
                    </div>
                    <p className="text-zinc-400 leading-relaxed">
                      {
                        item.lookup.lookupExplanation?.[
                          selectedLookup.index
                        ]
                      }
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ⚠️ Errors & Clarifications (always show header) */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                ⚠️ Errors & Clarifications
              </h3>

              {item.error?.errorMatch?.length > 0 ? (
                <div className="space-y-2">
                  {item.error.errorMatch.map((match, i) => (
                    <p
                      key={i}
                      className="text-sm leading-relaxed text-zinc-300"
                    >
                      <span className="font-medium text-amber-300">
                        “{firstFiveWords(match)}…”
                      </span>{" "}
                      <span className="text-zinc-400">
                        — {item.error.errorExplanation?.[i]}
                      </span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-zinc-500">
                  No errors or clarifications detected.
                </p>
              )}
            </div>

            {/* ❓ Follow-up Questions */}
            {role === "GUEST" &&
                Array.isArray(item.followup?.followupQuestion) &&
                item.followup.followupQuestion.length > 0 && (
                    <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        ❓ Suggested Follow-up Questions
                    </h3>

                    <ul className="list-disc list-inside space-y-1 text-sm text-zinc-300">
                        {item.followup.followupQuestion.map((q, i) => (
                        <li key={i}>{q}</li>
                        ))}
                    </ul>
                    </div>
                )}


            {index < items.length - 1 && (
              <hr className="border-zinc-700 pt-2" />
            )}
          </section>
        );
      })}
    </div>
  );
}
