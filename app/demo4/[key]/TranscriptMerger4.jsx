"use client";

import Navbar from "./navbar";
import React, { useMemo, useState, useEffect } from "react";
import { titleCase } from "title-case";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Dark-mode safe speaker badges
const speakerBgColors = [
  "bg-zinc-800 text-zinc-100 border-zinc-700",
  "bg-blue-900/40 text-blue-100 border-blue-700",
  "bg-purple-900/40 text-purple-100 border-purple-700",
  "bg-emerald-900/40 text-emerald-100 border-emerald-700",
  "bg-amber-900/40 text-amber-100 border-amber-700",
  "bg-pink-900/40 text-pink-100 border-pink-700",
];

// ─── HELPERS ─────────────────────────────────────────────

function shouldDisplayRole(name, role) {
  if (!role) return false;
  if (!name) return true;

  const n = name.trim().toLowerCase();
  const r = role.trim().toLowerCase();

  if (n === r) return false;
  if (n.includes(r)) return false;
  return true;
}

function firstFiveWords(str) {
  if (!str) return "";
  return str.split(" ").slice(0, 5).join(" ");
}

function formatSeconds(seconds) {
  if (seconds == null) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
}

function getSpeakerLabelParts(merged, speakerIndex) {
  return {
    name: merged.metadata?.speakerName?.[speakerIndex],
    role: merged.metadata?.speakerRole?.[speakerIndex]?.toUpperCase() ?? null,
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
  const hasValidError =
    turn.error?.errorMatch?.some(
      (e) => typeof e === "string" && e.trim().length > 0
    ) ?? false;

  return (
    (turn.lookup?.lookupTerm?.length ?? 0) > 0 ||
    hasValidError ||
    (turn.followup?.followupQuestion?.length ?? 0) > 0 ||
    !!turn.response 
  );
}

function clampPct(value) {
  return Math.max(0, Math.min(100, value));
}

/**
 * Highlights terms in the text.
 */
function highlightTerms(
  text,
  lookup,
  turnId,
  errorMatch,
  onLookupClick,
  selectedLookup,
  useWhiteButtons = false
) {
  if (!text || typeof text !== "string") return text;

  const errors = Array.isArray(errorMatch)
    ? errorMatch.filter((e) => typeof e === "string" && e.trim().length > 0)
    : errorMatch && typeof errorMatch === "string" && errorMatch.trim().length > 0
    ? [errorMatch]
    : [];

  const lookups = lookup?.lookupTerm || [];
  const matches = [];

  function findAll(haystack, needle, type) {
    if (!needle || typeof needle !== "string") return;
    const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedNeedle, "gi");
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

    // ─── ERROR STYLING ───
    if (seg.type === "error") {
      return (
        <span
          key={`err-${turnId}-${i}`}
          className="text-amber-300 font-medium mx-0.5"
        >
          {seg.text}
        </span>
      );
    }

    // ─── LOOKUP STYLING ───
    if (seg.type === "lookup") {
      const index = lookups.indexOf(seg.needle);
      const isActive =
        selectedLookup?.turnID === turnId && selectedLookup?.index === index;

      let buttonClasses = "";

      if (isActive) {
        buttonClasses = "bg-blue-500/20 border-blue-400 text-blue-200";
      } else if (useWhiteButtons) {
        buttonClasses =
          "bg-white border-white/50 text-zinc-900 hover:bg-zinc-100";
      } else {
        buttonClasses = "border-zinc-700 text-zinc-300 hover:bg-zinc-800";
      }

      return (
        <button
          key={`lk-${turnId}-${i}`}
          onClick={() => onLookupClick && onLookupClick(turnId, index)}
          className={`
            inline-flex items-center justify-center align-middle 
            mx-1 px-2 py-0.5 rounded border transition-colors 
            leading-none
            ${buttonClasses}
          `}
        >
          {seg.text}
        </button>
      );
    }

    return seg.text;
  });
}

// ─── COMPONENT ───────────────────────────────────────────

export default function TranscriptMerger({ beforellm, afterllm, metapod }) {
  const [selectedLookup, setSelectedLookup] = useState(null);
  const [isReversed, setIsReversed] = useState(true);
  const [viewMode, setViewMode] = useState("detailed");

  // ─── MERGE ─────────────────────────────────────────────
  const merged = useMemo(() => {
    const beforeArr = Array.isArray(beforellm)
      ? beforellm
      : beforellm?.turns || [];
    const afterArr = Array.isArray(afterllm) ? afterllm : afterllm?.turns || [];

    if (!beforeArr.length || !afterArr.length) {
      return { turns: [], metadata: {} };
    }

    const metadata =
      afterArr.find(
        (item) =>
          Array.isArray(item.speakerName) && Array.isArray(item.speakerRole)
      ) || {};

    const map = new Map();
    afterArr.forEach((item) => {
      if (item?.ID != null) {
          // Unified Merge Logic: Ensure we don't overwrite partial data
          const existing = map.get(item.ID) || {};
          map.set(item.ID, { ...existing, ...item });
      }
    });

    return {
      metadata,
      turns: beforeArr.map((turn, index) => ({
        ...turn,
        turnNumber: index + 1,
        ...(map.get(turn.ID) || {}),
      })),
    };
  }, [beforellm, afterllm]);

  const items = useMemo(() => {
    const base = merged.turns
      .filter((t) => typeof t.ID === "number")
      .filter(hasAnnotations);

    return [...base].sort((a, b) => (isReversed ? b.ID - a.ID : a.ID - b.ID));
  }, [merged.turns, isReversed]);

  useEffect(() => {
    if (merged.turns.length) {
      console.log("MERGED READY:", merged);
    }
  }, [merged]);

  const maxDuration = Math.max(...items.map(getDurationSeconds), 1);

  const handleLookupClick = (turnID, index) => {
    setSelectedLookup((prev) => {
      if (prev?.turnID === turnID && prev?.index === index) {
        return null;
      }
      return { turnID, index };
    });
  };

  if (!beforellm || !afterllm) {
    return (
      <div className="p-6 text-zinc-400">Waiting for transcript data…</div>
    );
  }

  // ─── RENDER ────────────────────────────────────────────
  return (
    <div className="bg-zinc-900 text-zinc-100 px-4 sm:px-6 py-8 space-y-8">
      {/* ─── HEADER SECTION ───────────────────────────── */}
      <div className="max-w-3xl mx-auto">
        <Navbar />

        <div className="text-3xl pb-2.5">{metapod.label}</div>
        <div className="pb-2.5">{metapod.moreinfo}</div>

        <div className="pb-2.5 flex items-center justify-between">
          {/* VIEW MODE SELECTION */}
          <RadioGroup
            value={viewMode}
            onValueChange={setViewMode}
            className="flex items-center gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem
                value="detailed"
                id="view-detailed"
                className="border-zinc-500 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
              />
              <Label
                htmlFor="view-detailed"
                className="text-zinc-300 cursor-pointer"
              >
                Detailed
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <RadioGroupItem
                value="condensed"
                id="view-condensed"
                className="border-zinc-500 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
              />
              <Label
                htmlFor="view-condensed"
                className="text-zinc-300 cursor-pointer"
              >
                Condensed
              </Label>
            </div>
          </RadioGroup>

          {/* SORT ORDER SELECTION */}
          <RadioGroup
            value={isReversed ? "newest" : "oldest"}
            onValueChange={(val) => setIsReversed(val === "newest")}
            className="flex items-center gap-6"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem
                value="newest"
                id="sort-newest"
                className="border-zinc-500 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
              />
              <Label
                htmlFor="sort-newest"
                className="text-zinc-300 cursor-pointer"
              >
                Newest First
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <RadioGroupItem
                value="oldest"
                id="sort-oldest"
                className="border-zinc-500 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
              />
              <Label
                htmlFor="sort-oldest"
                className="text-zinc-300 cursor-pointer"
              >
                Oldest First
              </Label>
            </div>
          </RadioGroup>
        </div>

        <hr className="border-zinc-700 pt-2" />
      </div>

      {viewMode === "detailed" ? (
        // ─── DETAILED VIEW ───────────────────────────────
        <div className="max-w-3xl mx-auto space-y-6">
          {items.map((item) => {
            const { name, role } = getSpeakerLabelParts(merged, item.speaker);
            const duration = getDurationSeconds(item);
            const isGuest = role?.toLowerCase() === "guest";

            // 1. FILTER ERRORS: Only allow non-empty strings
            const validErrors =
              item.error?.errorMatch?.filter(
                (e) => typeof e === "string" && e.trim().length > 0
              ) || [];

            return (
              <div key={item.ID} className="space-y-2">
                {/* Bubble */}
                <div
                  className={`flex ${
                    isGuest ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 border space-y-2 ${
                      speakerBgColors[item.speaker % speakerBgColors.length]
                    }`}
                  >
                    <div className="uppercase tracking-wide text-zinc-300 flex items-center gap-2">
                      <span className="text-zinc-200">{item.turnNumber}.</span>
                      <span>{name}</span> -
                      {shouldDisplayRole(name, role) && (
                        <span className="text-zinc-400">{role}</span>
                      )}
                      <span className="">
                        &nbsp;
                        {formatSeconds(item.startBeginning)} →{" "}
                        {formatSeconds(item.startEnd)} · {duration.toFixed(1)}s
                      </span>
                    </div>

                    <div className="whitespace-pre-wrap">
                      {highlightTerms(
                        item.text,
                        item.lookup,
                        item.ID,
                        item.error?.errorMatch,
                        handleLookupClick,
                        selectedLookup,
                        true // useWhiteButtons = TRUE
                      )}
                    </div>
                  </div>
                </div>

                {/* Active Lookup Card */}
                {selectedLookup?.turnID === item.ID && (
                  <div
                    className={`max-w-[75%] rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 shadow-sm ${
                      isGuest ? "ml-auto mr-2" : "ml-2"
                    }`}
                  >
                    <div className="font-medium text-zinc-900 mb-1">
                      {titleCase(
                        item.lookup.lookupTerm[selectedLookup.index]
                      )}
                    </div>
                    <p className="text-zinc-600">
                      {item.lookup.lookupExplanation?.[selectedLookup.index]}
                    </p>
                  </div>
                )}

                <div className="pl-6 space-y-2">
                  
                  {/* ─── NEW: RESPONSE ASSESSMENT ─── */}
                  {/* Styled to match Errors/Followups */}
                  {item.response && (
                    <div
                      className={`max-w-[75%] space-y-1 ${
                        isGuest ? "ml-auto mr-2" : "ml-2"
                      }`}
                    >
                      <h3 className="font-semibold uppercase tracking-wide text-zinc-500">
                        ✅ Answer Assessment
                      </h3>
                      
                      <div className="text-zinc-400">
                         <span className={`font-medium ${
                            (item.response.responseScore || 0) >= 0.8 
                            ? "text-emerald-400" 
                            : "text-amber-400"
                         }`}>
                             Score: {((item.response.responseScore || 0) * 100).toFixed(0)}%
                         </span>
                         {" "}- {item.response.responseSummation}
                      </div>
                    </div>
                  )}

                  {/* Errors List */}
                  {validErrors.length > 0 && (
                    <div
                      className={`max-w-[75%] space-y-1 ${
                        isGuest ? "ml-auto mr-2" : "ml-2"
                      }`}
                    >
                      <h3 className="font-semibold uppercase tracking-wide text-zinc-500">
                        ⚠️ Errors & Clarifications
                      </h3>

                      {validErrors.map((match, i) => (
                        <p key={i} className="text-zinc-400">
                          <span className="font-medium text-amber-300">
                            “{firstFiveWords(match)}…”
                          </span>{" "}
                          — {item.error.errorExplanation?.[i]}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Follow-ups */}
                  {role === "GUEST" &&
                    item.followup?.followupQuestion?.length > 0 && (
                      <div
                        className={`max-w-[75%] space-y-1 ${
                          isGuest ? "ml-auto mr-2" : "ml-2"
                        }`}
                      >
                        <h3 className="font-semibold uppercase tracking-wide text-zinc-500">
                          ❓ Suggested Follow-ups
                        </h3>

                        <ul className="list-disc list-inside text-zinc-400 space-y-0.5">
                          {item.followup.followupQuestion.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ─── CONDENSED VIEW ─────────────────────────────
        <div className="max-w-3xl mx-auto">
          {items.map((item, index) => {
            const { name, role } = getSpeakerLabelParts(merged, item.speaker);
            const duration = getDurationSeconds(item);
            const fillPct = clampPct((duration / maxDuration) * 100);

            // 1. FILTER ERRORS: Only allow non-empty strings
            const validErrors =
              item.error?.errorMatch?.filter(
                (e) => typeof e === "string" && e.trim().length > 0
              ) || [];

            return (
              <section
                key={item.ID}
                className="border-b border-zinc-800 py-3 first:pt-0 last:border-0 space-y-3"
              >
                {/* Header & Duration Bar */}
                <div className="space-y-2">
                  <header className="flex items-center gap-1.5 text-zinc-300">
                    <span className="text-zinc-500">{item.turnNumber}.</span>
                    <span className="font-medium">{name}</span>
                    {shouldDisplayRole(name, role) && (
                      <span className="text-zinc-500">· {role}</span>
                    )}
                  </header>

                  {/* Duration Bar: w-1/3 and h-2 */}
                  <div className="w-1/3 h-2 rounded bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-400"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 gap-4">
                    
                  {/* ─── NEW: RESPONSE ASSESSMENT ─── */}
                  {item.response && (
                    <div className="space-y-1 pt-1">
                      <h3 className="font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                        Answer Assessment
                      </h3>
                      <div className="text-zinc-400 text-sm">
                         <span className={`font-bold ${
                            (item.response.responseScore || 0) >= 0.8 
                            ? "text-emerald-400" 
                            : "text-amber-400"
                         }`}>
                             {((item.response.responseScore || 0) * 100).toFixed(0)}%
                         </span>
                         {" "}- {item.response.responseSummation}
                      </div>
                    </div>
                  )}

                  {/* Lookup */}
                  {item.lookup?.lookupTerm?.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {item.lookup.lookupTerm.map((term, i) => {
                          const isActive =
                            selectedLookup?.turnID === item.ID &&
                            selectedLookup?.index === i;

                          return (
                            <button
                              key={i}
                              onClick={() => handleLookupClick(item.ID, i)}
                              className={`px-2 py-1 rounded border transition-colors ${
                                isActive
                                  ? "bg-blue-500/20 border-blue-400 text-blue-200"
                                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                              }`}
                            >
                              {titleCase(term)}
                            </button>
                          );
                        })}
                      </div>

                      {selectedLookup?.turnID === item.ID && (
                        <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                          <div className="font-medium text-zinc-200 mb-1">
                            {titleCase(
                              item.lookup.lookupTerm[selectedLookup.index]
                            )}
                          </div>
                          <p className="text-zinc-400">
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

                  {/* Errors - Check validErrors.length instead of errorMatch.length */}
                  <div className="space-y-1">
                    {validErrors.length > 0 ? (
                      validErrors.map((match, i) => (
                        <p key={i} className="text-zinc-300">
                          <span className="text-amber-300 font-medium">
                            “{firstFiveWords(match)}…”
                          </span>{" "}
                          — {item.error.errorExplanation?.[i]}
                        </p>
                      ))
                    ) : (
                       // Only show "No errors" if NO other annotations exist
                       !item.response && !item.lookup?.lookupTerm?.length && !item.followup?.followupQuestion?.length && (
                          <p className="italic text-zinc-600">
                            No errors detected.
                          </p>
                       )
                    )}
                  </div>

                  {/* Follow-ups */}
                  {role === "GUEST" &&
                    item.followup?.followupQuestion?.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <h3 className="font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                          Suggested Follow-ups
                        </h3>
                        <ul className="list-disc list-inside text-zinc-400 space-y-0.5">
                          {item.followup.followupQuestion.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}