"use client";

import React, { useMemo, useState } from "react";
import { speakerColors } from "../../lib/colorbubble";

export default function Display({ beforellm, afterllm }) {
  const [selectedLookup, setSelectedLookup] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [visibleErrorCount, setVisibleErrorCount] = useState(10);

  // --- HELPERS ---
  function formatTimestamp(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  function firstSixWords(str) {
    if (!str) return "";
    return str.split(" ").slice(0, 6).join(" ");
  }

  // Flatten all lookup entries
  const flattened = useMemo(() => {
    if (!Array.isArray(afterllm)) return [];

    const items = [];

    for (const item of afterllm) {
      if (!item?.lookup) continue;

      const terms = item.lookup.lookupTerm || [];
      const explanations = item.lookup.lookupExplanation || [];
      const links = item.lookup.lookupLink || [];

      terms.forEach((term, idx) => {
        items.push({
          term,
          explanation: explanations[idx],
          link: links[idx],
          timestamp: item.lookup.lookupTermTimestamp
        });
      });
    }

    return items.slice(-25);
  }, [afterllm]);

  // Flatten all error entries
  const flattenedErrors = useMemo(() => {
    if (!Array.isArray(afterllm)) return [];

    const items = [];

    for (const item of afterllm) {
      if (!item?.error) continue;

      const matches = item.error.errorMatch;
      const explanations = item.error.errorExplanation;
      const timestamp = item.error.errorMatchTimestamp;

      if (Array.isArray(matches)) {
        matches.forEach((m, idx) => {
          if (!m) return;
          items.push({
            match: m,
            explanation: explanations?.[idx] ?? null,
            timestamp
          });
        });
      } else if (matches) {
        items.push({
          match: matches,
          explanation: explanations ?? null,
          timestamp
        });
      }
    }

    return items;
  }, [afterllm]);

  return (
    <div className="space-y-6">

      {/* ERROR SECTION */}
      {flattenedErrors.length > 0 && (
        <div className="pt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Errors
          </div>

          {flattenedErrors.slice(0, visibleErrorCount).map((err, i) => (
            <div key={i} className="mb-3 text-sm text-zinc-200">
              <span className="font-medium text-amber-300">
                “{firstSixWords(err.match)}…”
              </span>

              {err.timestamp && (
                <span className="ml-2 text-xs text-zinc-400">
                  {formatTimestamp(err.timestamp)}
                </span>
              )}

              {err.explanation && (
                <span className="text-zinc-400">
                  {" — "}
                  {err.explanation}
                </span>
              )}
            </div>
          ))}

          {visibleErrorCount < flattenedErrors.length && (
            <button
              onClick={() => setVisibleErrorCount((prev) => prev + 5)}
              className="mt-2 rounded border border-blue-500/50 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/10 transition"
            >
              Load more
            </button>
          )}
        </div>
      )}

      {/* LOOKUP BUTTONS */}
      {flattened.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Look-up Terminology
          </div>

          <div className="flex flex-wrap gap-2">
            {flattened.map((entry, idx) => {
              const isActive = selectedItem === entry.term;

              return (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedLookup(entry);
                    setSelectedItem(entry.term);
                  }}
                  className={
                    "px-3 py-1 text-sm border transition " +
                    (isActive
                      ? "bg-blue-500/20 border-blue-400 text-blue-200"
                      : "border-zinc-600 text-zinc-300 hover:bg-zinc-700")
                  }
                >
                  {entry.term}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SELECTED LOOKUP DETAILS */}
      {selectedLookup && (
        <div className="mt-2 rounded border border-zinc-700 bg-zinc-800 p-3 text-sm">
          <div className="mb-1 text-zinc-200 font-medium">
            {selectedLookup.term}
            {selectedLookup.timestamp && (
              <span className="ml-2 text-xs text-zinc-400">
                {formatTimestamp(selectedLookup.timestamp)}
              </span>
            )}
          </div>

          <div className="text-zinc-400">
            {selectedLookup.explanation}
            {selectedLookup.link && (
              <>
                {" "}
                <a
                  href={selectedLookup.link}
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
  );
}
