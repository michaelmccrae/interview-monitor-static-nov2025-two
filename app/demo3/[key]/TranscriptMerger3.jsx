"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import Link from "next/link";
import Navbar from "./navbar";

import React, { useMemo, useState } from "react";
import { useEffect } from "react";
import { titleCase } from "title-case";

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

// name and speaker role same

function shouldDisplayRole(name, role) {
  if (!role) return false;
  if (!name) return true;

  const n = name.trim().toLowerCase();
  const r = role.trim().toLowerCase();

  // Exact match → hide role
  if (n === r) return false;

  // Name already implies role (e.g. "Guest Speaker", "Host John")
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
  const role = merged.metadata?.speakerRole?.[speakerIndex];

  return {
    name,
    role: role ? role.toUpperCase() : null,
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

export default function TranscriptMerger({ beforellm, afterllm, metapod }) {
  const [selectedLookup, setSelectedLookup] = useState(null);
  const [isReversed, setIsReversed] = useState(true); // default: reverse chronological

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
    if (merged.turns.length === 0) return;

    console.log("MERGED READY:", merged);
  }, [merged]);

  const maxDuration = Math.max(...items.map(getDurationSeconds), 1);

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
      <div className="max-w-3xl mx-auto">
        <Navbar />

        <div className="text-3xl pb-2.5">{metapod.label}</div>
        <div className="text-sm pb-2.5">{metapod.moreinfo}</div>
        <div className="pb-2.5">
          <button
            onClick={() => setIsReversed((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-md border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition"
          >
            {isReversed ? "Show Oldest → Newest" : "Show Newest → Oldest"}
          </button>
        </div>
        <hr className="border-zinc-700 pt-2" />
      </div>

      {items.map((item, index) => {
        const { name, role } = getSpeakerLabelParts(merged, item.speaker);
        const duration = getDurationSeconds(item);
        const fillPct = clampPct((duration / maxDuration) * 100);

        return (
          <section key={item.ID} className="max-w-3xl mx-auto space-y-6">
            {/* Speaker Header */}
            <header className="space-y-1">
              {/* Name + color block + role */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold leading-tight">
                    {name}
                  </span>

                  {shouldDisplayRole(name, role) && (
                    <span className="text-sm tracking-widest text-zinc-400">
                      {role}
                    </span>
                  )}
                </div>

                {/* Color code block */}
                <span
                  className={`w-5 h-5 rounded border ${
                    speakerBgColors[item.speaker % speakerBgColors.length]
                  }`}
                  aria-hidden
                />
              </div>

              {/* Timestamp */}
              <div className="text-xs text-zinc-500">
                {formatSeconds(item.startBeginning)} →{" "}
                {formatSeconds(item.startEnd)} · {duration.toFixed(1)}s
              </div>
            </header>

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
                  🔬 Terminology
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
                            isActive ? null : { turnID: item.ID, index: i }
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
                      {titleCase(item.lookup.lookupTerm[selectedLookup.index])}
                    </div>
                    <p className="text-zinc-400 leading-relaxed">
                      {item.lookup.lookupExplanation?.[selectedLookup.index]}
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
