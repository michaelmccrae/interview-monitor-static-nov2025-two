"use client";

import React, { useMemo, useState } from "react";
import { speakerColors } from "../../lib/colorbubble";

export default function Display({ beforellm, afterllm }) {
  const [selectedLookup, setSelectedLookup] = useState(null);

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
          timestamp: item.lookup.lookupTermTimestamp,
        });

      });
    }

    // Return only last 25
    return items.slice(-25);
  }, [afterllm]);

  return (
    <div>
      {/* LOOKUP BUTTONS (only last 25) */}
      <div>
        {flattened
          .map((entry, idx) => (
            <span
              key={idx}
              className="inline-block px-3 py-1 m-1 border border-black rounded cursor-pointer hover:bg-gray-300"
            onClick={() =>
              setSelectedLookup({
                term: entry.term,
                explanation: entry.explanation,
                link: entry.link,
                timestamp: entry.timestamp,
              })
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
      {/* SELECTED LOOKUP DETAILS */}
{selectedLookup && (
  <div>
    {/* TERM + FORMATTED TIMESTAMP */}
    <div>
      {selectedLookup.term}{" "}
      -{" "}
      {selectedLookup.timestamp &&
        new Date(selectedLookup.timestamp).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        })}
    </div>

    {/* EXPLANATION + LINK IN ONE SPAN */}
        <span>
          {selectedLookup.explanation}
          {selectedLookup.link && (
            <>
              {" "}
              <a
                href={selectedLookup.link}
                target="_blank"
                rel="noopener noreferrer"
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
