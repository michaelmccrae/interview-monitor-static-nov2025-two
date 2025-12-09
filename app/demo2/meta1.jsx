"use client";

import React, { useMemo, useState } from "react";
import { speakerColors } from "../../lib/colorbubble";

export default function Display({ beforellm, afterllm }) {
  const [selectedLookup, setSelectedLookup] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null); // NEW: highlight key
  const [visibleErrorCount, setVisibleErrorCount] = useState(10); // NEW: pagination state

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
      if (!item || !item.lookup) continue;

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
      if (!item || !item.error) continue;

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

    // Removed .slice(-25) to allow pagination over the full set
    return items;
  }, [afterllm]);

  return (
    <div>

      {/* ERROR SECTION */}
      {flattenedErrors.length > 0 && (
        <div className="pt-3">
          <div className="font-bold mb-2 text-slate-600 uppercase">Errors</div>

          {flattenedErrors.slice(0, visibleErrorCount).map((err, i) => (
            <div key={i} className="mb-3">

              {/* Clickable + highlight */}
              <div>
                <span>“{firstSixWords(err.match)}...”</span>

                <span> ({formatTimestamp(err.timestamp)})</span>

                {err.explanation && (
                  <span> - {err.explanation}</span>
                )}
              </div>

            </div>
          ))}

          {/* LOAD MORE BUTTON */}
          {visibleErrorCount < flattenedErrors.length && (
            <button
              onClick={() => setVisibleErrorCount((prev) => prev + 10)}
              className="mt-1 mb-4 px-3 py-1 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
            >
              Click more
            </button>
          )}
        </div>
      )}

      {/* LOOKUP BUTTONS */}
      <div>
         <div className="font-bold mb-2 text-slate-600 uppercase">Look-up Terminology</div>
        {flattened
          .map((entry, idx) => (
            <span
              key={idx}
              onClick={() => {
                setSelectedLookup({
                  term: entry.term,
                  explanation: entry.explanation,
                  link: entry.link,
                  timestamp: entry.timestamp
                });
                setSelectedItem(entry.term); // NEW: highlight lookup
              }}
              className={
                "inline-block px-3 py-1 m-1 border rounded cursor-pointer " +
                (selectedItem === entry.term
                  ? "bg-yellow-300 border-yellow-600"
                  : "border-black hover:bg-gray-200")
              }
            >
              {entry.term}
            </span>
          ))
          .reduce(
            (acc, el) => (acc === null ? [el] : [...acc, " ", el]),
            null
          )}
      </div>

      {/* SELECTED LOOKUP DETAILS */}
      {selectedLookup && (
        <div className="mt-2 p-2 border border-gray-300 rounded bg-gray-50">
          <div>
            {selectedLookup.term} - {formatTimestamp(selectedLookup.timestamp)}
          </div>

          <span>
            {selectedLookup.explanation}
            {selectedLookup.link && (
              <>
                {" "}
                <a
                  href={selectedLookup.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  {selectedLookup.link}
                </a>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}