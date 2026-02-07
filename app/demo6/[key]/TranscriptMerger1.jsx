"use client";

import Navbar from "./navbar";
import React, { useMemo, useState, useEffect } from "react";
import { titleCase } from "title-case";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getGoogleFinanceUrl } from "@/lib/googlefinance";

// Dark-mode safe speaker badges (Tripled)
const speakerBgColors = [
  "bg-zinc-800 text-zinc-100 border-zinc-700",
  "bg-slate-800 text-slate-100 border-slate-700",
  "bg-stone-800 text-stone-100 border-stone-700",
  "bg-red-900/40 text-red-100 border-red-700",
  "bg-rose-900/40 text-rose-100 border-rose-700",
  "bg-pink-900/40 text-pink-100 border-pink-700",
  "bg-orange-900/40 text-orange-100 border-orange-700",
  "bg-amber-900/40 text-amber-100 border-amber-700",
  "bg-yellow-900/40 text-yellow-100 border-yellow-700",
  "bg-lime-900/40 text-lime-100 border-lime-700",
  "bg-green-900/40 text-green-100 border-green-700",
  "bg-emerald-900/40 text-emerald-100 border-emerald-700",
  "bg-teal-900/40 text-teal-100 border-teal-700",
  "bg-cyan-900/40 text-cyan-100 border-cyan-700",
  "bg-sky-900/40 text-sky-100 border-sky-700",
  "bg-blue-900/40 text-blue-100 border-blue-700",
  "bg-indigo-900/40 text-indigo-100 border-indigo-700",
  "bg-violet-900/40 text-violet-100 border-violet-700",
  "bg-purple-900/40 text-purple-100 border-purple-700",
  "bg-fuchsia-900/40 text-fuchsia-100 border-fuchsia-700",
];

// ─── HELPERS ─────────────────────────────────────────────

console.log("🔥 TranscriptMerger FILE LOADED");

function hasValidTickerData(ticker) {
  return (
    Array.isArray(ticker?.ticker) &&
    ticker.ticker.length > 0 &&
    ticker.ticker.some((t) => typeof t === "string" && t.trim().length > 0)
  );
}

function getSpeakerColorClass(name) {
  if (!name) return speakerBgColors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash % speakerBgColors.length);
  return speakerBgColors[index];
}

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
  const name = merged.metadata?.speakerName?.[speakerIndex];

  return {
    name: name ?? `Speaker ${speakerIndex}`,
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
  // --- TEMPORARY OVERRIDE: SHOW EVERYTHING ---
  return true;
}

function clampPct(value) {
  return Math.max(0, Math.min(100, value));
}

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
    : errorMatch &&
      typeof errorMatch === "string" &&
      errorMatch.trim().length > 0
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

    if (seg.type === "lookup") {
      const index = lookups.indexOf(seg.needle);
      const isActive =
        selectedLookup?.turnID === turnId && selectedLookup?.index === index;

      let buttonClasses = "";

      if (isActive) {
        buttonClasses =
          "bg-blue-500/20 border-blue-400 text-blue-200 shadow-inner";
      } else if (useWhiteButtons) {
        buttonClasses =
          "bg-white border-zinc-400 text-zinc-900 hover:bg-zinc-100 active:scale-[0.97]";
      } else {
        buttonClasses =
          "bg-zinc-900 border-zinc-600 text-zinc-300 hover:bg-zinc-800 active:scale-[0.97]";
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

  // COMMENTED OUT: Usage of followup in console log
  /*
  console.log(
  "RAW FOLLOWUPS EMITTED:",
  afterllm.filter(
    x =>
      Array.isArray(x?.followup?.followupQuestion) &&
      x.followup.followupQuestion.length > 0
  )
);
*/

  /* // --- FILTER STATE COMMENTED OUT ---
  const [filters, setFilters] = useState({
    Substantial: true,
    Smalltalk: false,
    Advertising: false,
  });

  const toggleFilter = (key) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  */

  // ─── MERGE ─────────────────────────────────────────────
  // ─── MERGE ─────────────────────────────────────────────
  const merged = useMemo(() => {
    const beforeArr = Array.isArray(beforellm)
      ? beforellm
      : beforellm?.turns || [];

    const afterArr = Array.isArray(afterllm) ? afterllm : afterllm?.turns || [];

    if (!beforeArr.length || !afterArr.length) {
      return { turns: [], metadata: {} };
    }

    // ─── METADATA (GLOBAL, NOT PER-TURN) ─────────────────
    const metadata =
      afterArr.find(
        (item) => item?.metadata === "speaker name and speaker role"
      ) || {};

    const speakerCorrections = metadata.speakerCorrections || {};
    const speakerStats = metadata.speakerStats || {};

    // ─── CLASSIFY PASSES BY INTENT ───────────────────────
    const basePasses = afterArr.filter((item) => item?.ID != null);

    const lookupPasses = afterArr.filter(
      (item) =>
        item?.ID != null &&
        Array.isArray(item.lookup?.lookupTerm) &&
        item.lookup.lookupTerm.length > 0
    );

    const errorPasses = afterArr.filter(
      (item) =>
        item?.ID != null &&
        Array.isArray(item.error?.errorMatch) &&
        item.error.errorMatch.length > 0
    );

    // COMMENTED OUT: Followup Passes
    /*
    const followupPasses = afterArr.filter(
      (item) =>
        item?.ID != null &&
        Array.isArray(item.followup?.followupQuestion) &&
        item.followup.followupQuestion.length > 0
    );

    console.log(
      "FOLLOWUP PASSES:",
      followupPasses.map((f) => ({
        ID: f.ID,
        count: f.followup.followupQuestion.length,
      }))
    );
    */

    // COMMENTED OUT: Response Passes
    /*
    const responsePasses = afterArr.filter(
      (item) => item?.ID != null && item.response
    );
    */

    // ─── INITIALIZE MAP (ONE ENTRY PER TURN) ─────────────
    const map = new Map();

    basePasses.forEach((item) => {
      const id = Number(item.ID);
      if (!Number.isFinite(id)) return;

      if (!map.has(id)) {
        map.set(id, { ID: id });
      }

      // COMMENTED OUT: Subject Matter and IsAd merging
      /*
      const base = map.get(id);

      if (typeof item.subjectMatter === "string") {
        base.subjectMatter = item.subjectMatter;
      }

      if (typeof item.isAd === "boolean") {
        base.isAd = item.isAd;
      }
      */
    });

    // ─── LOOKUP PHASE (LOOKUP ONLY) ──────────────────────
    lookupPasses.forEach((item) => {
      const id = Number(item.ID);
      const base = map.get(id);
      if (!base) return;

      base.lookup = {
        ...item.lookup,
        ID: id,
      };
    });

    // ─── ERROR PHASE (ERROR ONLY) ────────────────────────
    errorPasses.forEach((item) => {
      const id = Number(item.ID);
      const base = map.get(id);
      if (!base) return;

      base.error = {
        ...item.error,
        ID: id,
      };
    });

    // ─── TICKER PHASE (PUBLIC COMPANY DATA + FINANCE LINKS) ────────────────
    const tickerPasses = afterArr.filter(
      (item) =>
        item?.ID != null && item.ticker && Array.isArray(item.ticker.ticker)
    );

    tickerPasses.forEach((item) => {
      const id = Number(item.ID);
      const base = map.get(id);
      if (!base) return;

      const tickers = item.ticker.ticker || [];
      const exchanges = item.ticker.exchange || [];

      base.ticker = {
        ...item.ticker,

        // ✅ NEW: Google Finance deep links (index-aligned)
        financeUrl: tickers.map((symbol, i) =>
          getGoogleFinanceUrl(symbol, exchanges[i])
        ),

        ID: id,
      };
    });

    console.log(
  "📈 TICKER LINKS BUILT",
  Array.from(map.values()).map((t) => ({
    id: t.ID,
    ticker: t.ticker?.ticker,
    url: t.ticker?.financeUrl,
  }))
);


    // ─── FOLLOWUP PHASE (FIRST VALID WINS) ───────────────
    // COMMENTED OUT
    /*
    followupPasses.forEach((item) => {
      const id = Number(item.ID);
      const base = map.get(id);
      if (!base) return;

      // Only write followups ONCE
      if (!Array.isArray(base.followup?.followupQuestion)) {
        base.followup = {
          ...item.followup,
          ID: id,
        };
      }
    });
    */

    // ─── RESPONSE PHASE ──────────────────────────────────
    // COMMENTED OUT
    /*
    responsePasses.forEach((item) => {
      const id = Number(item.ID);
      const base = map.get(id);
      if (!base) return;

      base.response = item.response;
    });
    */

    // ─── MERGE INTO BEFORELLM ────────────────────────────
    const finalTurns = beforeArr.map((turn, index) => {
      const id = Number(turn.ID);

      const correctedSpeaker = speakerCorrections[id] ?? turn.speaker;

      return {
        ...turn,
        ID: id,
        speaker: correctedSpeaker, // 🔥 corrected diarization
        turnNumber: index + 1,
        speakerNameResolved: metadata?.speakerName?.[correctedSpeaker] ?? null,
        speakerRoleResolved: metadata?.speakerRole?.[correctedSpeaker] ?? null,
        speakerStatsResolved: speakerStats?.[correctedSpeaker] ?? null,
        ...(map.get(id) || {}),
      };
    });

    return {
      metadata,
      turns: finalTurns,
    };
  }, [beforellm, afterllm]);

  // ─── MAIN ITEMS (ALL) ──────────────────────────────────
  const items = useMemo(() => {
    const base = merged.turns
      .filter((t) => typeof t.ID === "number")
      // --- FILTER LOGIC COMMENTED OUT ---
      /*
      .filter((t) => {
        let category = "Substantial";
        if (t.subjectMatter) {
          category = t.subjectMatter;
        } else if (t.isAd) {
          category = "Advertising";
        }

        if (category === "Advertising") return filters.Advertising;
        if (category === "Smalltalk") return filters.Smalltalk;
        if (category === "Substantial") return filters.Substantial;
        return filters.Substantial; // Fallback
      })
      */
      .filter(hasAnnotations);

    return [...base].sort((a, b) => (isReversed ? b.ID - a.ID : a.ID - b.ID));
  }, [merged.turns, isReversed /*, filters*/]);

  // ─── CONDENSED ITEMS FILTER ────────────────────────────
  const condensedItems = useMemo(() => {
    return items.filter((item) => {
      const hasLookup = item.lookup?.lookupTerm?.length > 0;
      const hasErrors = item.error?.errorMatch?.some(
        (e) => typeof e === "string" && e.trim().length > 0
      );
      const hasTicker = hasValidTickerData(item.ticker);

      return hasLookup || hasErrors || hasTicker;
    });
  }, [items]);

  useEffect(() => {
    console.log("🧪 MERGE DEBUG", {
      beforeLen: Array.isArray(beforellm)
        ? beforellm.length
        : beforellm?.turns?.length,
      afterLen: Array.isArray(afterllm)
        ? afterllm.length
        : afterllm?.turns?.length,
      mergedLen: merged.turns.length,
    });
  }, [beforellm, afterllm, merged]);

  useEffect(() => {
    console.log("🧩 MERGED OBJECT:", {
      hasBefore: Array.isArray(beforellm),
      hasAfter: Array.isArray(afterllm),
      turnCount: merged.turns.length,
      merged,
    });
  }, [merged, beforellm, afterllm]);

  const maxDuration = Math.max(...items.map(getDurationSeconds), 1);

  const handleLookupClick = (turnID, index) => {
    setSelectedLookup((prev) => {
      if (prev?.turnID === turnID && prev?.index === index) {
        return null;
      }
      return { turnID, index };
    });
  };

  const handleJumpToDetailed = (id) => {
    setViewMode("detailed");
    setTimeout(() => {
      const element = document.getElementById(`turn-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
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

        <div className="pb-2.5 flex flex-wrap items-center justify-between gap-4">
          {/* LEFT: VIEW MODE SELECTION */}
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

          {/* RIGHT: SORT ORDER SELECTION */}
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
                Newest
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
                Oldest
              </Label>
            </div>
          </RadioGroup>

          {/* --- FILTER BUTTONS COMMENTED OUT --- */}
        </div>

        <hr className="border-zinc-700 pt-2" />
      </div>

      {viewMode === "detailed" ? (
        // ─── DETAILED VIEW ───────────────────────────────
        <div className="max-w-3xl mx-auto space-y-6">
          {items.map((item, index) => {
            // ─── CHAT-STYLE BUBBLE ALIGNMENT ─────────────────
            const prevItem = items[index - 1];

            let isRightAligned = false;

            // First bubble → left
            if (!prevItem) {
              isRightAligned = false;
            }
            // Same speaker as previous → keep same side
            else if (prevItem.speaker === item.speaker) {
              isRightAligned = prevItem.__isRightAligned ?? false;
            }
            // Different speaker → flip side
            else {
              isRightAligned = !(prevItem.__isRightAligned ?? false);
            }

            // Store on item for next iteration (local, render-only)
            item.__isRightAligned = isRightAligned;

            // ────────────────────────────────────────────────

            const name =
              item.speakerNameResolved ??
              merged.metadata?.speakerName?.[item.speaker] ??
              `Speaker ${item.speaker}`;

            const role =
              item.speakerRoleResolved ??
              merged.metadata?.speakerRole?.[item.speaker] ??
              null;

            const duration = getDurationSeconds(item);

            // OLD LOGIC: const isGuest = role?.toLowerCase() === "guest";
            // NEW LOGIC: Even speaker # on LEFT, Odd speaker # on RIGHT
            // const isEvenSpeaker =
            //   typeof item.speaker === "number" && item.speaker % 2 === 0;
            // const isRightAligned = !isEvenSpeaker;

            const validErrors =
              item.error?.errorMatch?.filter(
                (e) => typeof e === "string" && e.trim().length > 0
              ) || [];

            // COMMENTED OUT: Subject Badge Logic
            /*
            let subjectBadge = null;
            if (item.subjectMatter === "Advertising" || item.isAd) {
              subjectBadge = (
                <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-xs border border-amber-500/50 select-none">
                  AD
                </span>
              );
            } else if (item.subjectMatter === "Smalltalk") {
              subjectBadge = (
                <span className="bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded text-xs border border-indigo-500/50 select-none">
                  SMALLTALK
                </span>
              );
            }
            */

            return (
              <div key={item.ID} id={`turn-${item.ID}`} className="space-y-2">
                {/* Bubble */}
                <div
                  className={`flex ${
                    isRightAligned ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 border space-y-2 ${getSpeakerColorClass(
                      name
                    )}`}
                  >
                    <div className="uppercase tracking-wide text-zinc-300 flex items-center gap-2 flex-wrap">
                      <a
                        href={`#turn-${item.ID}`}
                        className="text-zinc-200 hover:underline"
                      >
                        {item.turnNumber}.
                      </a>
                      <span>{name}</span> -
                      {shouldDisplayRole(name, role) && (
                        <span className="text-zinc-400">{role}</span>
                      )}
                      {/* COMMENTED OUT: Subject Badge */}
                      {/* {subjectBadge} */}
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
                        true
                      )}
                    </div>
                  </div>
                </div>

                {/* Active Lookup Card */}
                {selectedLookup?.turnID === item.ID && (
                  <div
                    className={`max-w-[75%] rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 shadow-sm ${
                      isRightAligned ? "ml-auto mr-2" : "ml-2"
                    }`}
                  >
                    <div className="font-medium text-zinc-900 mb-1">
                      {titleCase(item.lookup.lookupTerm[selectedLookup.index])}
                    </div>
                    <p className="text-zinc-600">
                      {item.lookup.lookupExplanation?.[selectedLookup.index]}
                    </p>
                  </div>
                )}

                <div className="pl-6 space-y-2">
                  {/* Errors List */}
                  {validErrors.length > 0 && (
                    <div
                      className={`max-w-[75%] space-y-1 ${
                        isRightAligned ? "ml-auto mr-2" : "ml-2"
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

                  {/* COMMENTED OUT: Response Assessment */}
                  {/*
                  {item.response && (
                    <div
                      className={`max-w-[75%] space-y-1 ${
                        isRightAligned ? "ml-auto mr-2" : "ml-2"
                      }`}
                    >
                      <h3 className="font-semibold uppercase tracking-wide text-zinc-500">
                        ✅ Answer Assessment
                      </h3>

                      <div className="text-zinc-400">
                        <span
                          className={`font-medium ${
                            (item.response.responseScore || 0) >= 0.8
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          Score:{" "}
                          {((item.response.responseScore || 0) * 100).toFixed(
                            0
                          )}
                          %
                        </span>{" "}
                        - {item.response.responseSummation}
                      </div>
                    </div>
                  )}
                  */}

                  {/* COMMENTED OUT: Follow-ups */}
                  {/*
                  {role === "GUEST" &&
                    item.followup?.followupQuestion?.length > 0 && (
                      <div
                        className={`max-w-[75%] space-y-1 ${
                          isRightAligned ? "ml-auto mr-2" : "ml-2"
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
                  */}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ─── CONDENSED VIEW ─────────────────────────────
        <div className="max-w-3xl mx-auto">
          {condensedItems.map((item, index) => {
            // Use filtered condensedItems
            const { name, role } = getSpeakerLabelParts(merged, item.speaker);
            const duration = getDurationSeconds(item);
            const fillPct = clampPct((duration / maxDuration) * 100);

            const validErrors =
              item.error?.errorMatch?.filter(
                (e) => typeof e === "string" && e.trim().length > 0
              ) || [];

            // COMMENTED OUT: Subject Badge Logic
            /*
            let subjectBadge = null;
            if (item.subjectMatter === "Advertising" || item.isAd) {
              subjectBadge = (
                <span className="bg-amber-500/20 text-amber-300 px-1.5 rounded text-xs border border-amber-500/50 select-none">
                  AD
                </span>
              );
            } else if (item.subjectMatter === "Smalltalk") {
              subjectBadge = (
                <span className="bg-indigo-500/20 text-indigo-300 px-1.5 rounded text-xs border border-indigo-500/50 select-none">
                  SMALLTALK
                </span>
              );
            }
            */

            return (
              <section
                key={item.ID}
                id={`turn-${item.ID}`}
                className="border-b border-zinc-800 py-3 first:pt-0 last:border-0 space-y-3"
              >
                <div className="space-y-2">
                  <header className="flex items-center gap-1.5 text-zinc-300">
                    <span className="text-zinc-500">{item.turnNumber}.</span>
                    <span className="font-medium">{name}</span>
                    {shouldDisplayRole(name, role) && (
                      <span className="text-zinc-500">· {role}</span>
                    )}
                    {/* LINK ICON: Jumps to Detailed View */}
                    <button
                      onClick={() => handleJumpToDetailed(item.ID)}
                      title="View in Detailed Mode"
                      className="ml-1 text-zinc-500 hover:text-blue-400 transition-colors"
                    >
                      🔗
                    </button>
                    {/* COMMENTED OUT: Subject Badge */}
                    {/* {subjectBadge} */}
                  </header>

                  <div className="w-1/3 h-2 rounded bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-400"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
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

                  {/* ─── TICKERS (PUBLIC COMPANIES) ───────────────── */}
                  {hasValidTickerData(item.ticker) && (
                    <div className="space-y-1">
                      <h3 className="font-semibold uppercase tracking-wide text-zinc-500">
                        Companies mentioned
                      </h3>

                      <ul className="list-disc list-inside text-zinc-300 space-y-0.5">
                        {item.ticker.ticker.map((symbol, i) => {
                          if (!symbol) return null;

                          const name = item.ticker.companyName?.[i];
                          const exchange = item.ticker.exchange?.[i];

                          return (
                            <li key={i}>
                              <a
                                href={item.ticker.financeUrl?.[i]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-blue-400 hover:underline"
                              >
                                {symbol}
                              </a>

                              {exchange && (
                                <span className="text-zinc-400">
                                  {" "}
                                  · {exchange}
                                </span>
                              )}
                              {name && (
                                <span className="text-zinc-400"> — {name}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Errors */}
                  <div className="space-y-1">
                    {validErrors.length > 0 ? (
                      <>
                        <h3 className="font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                          Errors and clarifications
                        </h3>
                        {validErrors.map((match, i) => (
                          <p key={i} className="text-zinc-300">
                            <span className="text-amber-300 font-medium">
                              “{firstFiveWords(match)}…”
                            </span>{" "}
                            — {item.error.errorExplanation?.[i]}
                          </p>
                        ))}
                      </>
                    ) : null}
                  </div>

                  {/* Answer Assessment and Follow-ups removed from Condensed View */}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
