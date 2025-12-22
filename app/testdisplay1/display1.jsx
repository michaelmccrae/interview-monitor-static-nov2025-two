"use client";

import React from "react";
import data from "./lookup.json";
import { titleCase } from "title-case";

// --- helpers ---
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

export default function LookupList() {
  const items = data
    .filter((item) => typeof item.ID === "number")
    .sort((a, b) => (b.ID ?? 0) - (a.ID ?? 0));

  return (
    <div className="bg-zinc-900 p-6 text-zinc-100">
      {items.map((item, index) => (
        <React.Fragment key={item.ID}>
          <div className="space-y-3">
            {/* Lookup terms */}
            {item.lookup?.lookupTerm?.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                {item.lookup.lookupTerm.map((term, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <button className="border border-blue-400 px-3 py-1 text-sm font-medium text-blue-300 hover:bg-blue-400/10 transition">
                      {titleCase(term)}
                    </button>
                    {item.lookup?.lookupTermTimestamp && (
                      <span className="text-xs text-zinc-400">
                        {formatHMS(item.lookup.lookupTermTimestamp)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Errors */}
            {item.error?.errorMatch &&
              item.error?.errorExplanation &&
              item.error.errorMatch.map((match, i) => (
                <div
                  key={i}
                  className="text-sm text-zinc-200 leading-relaxed"
                >
                  <span className="font-semibold text-amber-300">
                    “{firstFiveWords(match)}…”
                  </span>

                  {item.error?.errorMatchTimestamp && (
                    <span className="mx-2 text-xs text-zinc-400">
                      {formatHMS(item.error.errorMatchTimestamp)}
                    </span>
                  )}

                  <span className="text-zinc-400">
                    — {item.error.errorExplanation?.[i]}
                  </span>
                </div>
              ))}

            {/* Follow-up questions */}
            {item.followup?.followupQuestion &&
              item.followup.followupQuestion.map((q, i) => (
                <div
                  key={i}
                  className="text-sm text-zinc-300 flex items-start gap-2"
                >
                  <span>
                    {q}
                    {item.followup?.followupQuestionTimestamp && (
                      <span className="ml-2 text-xs text-zinc-500">
                        {formatHMS(item.followup.followupQuestionTimestamp)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
          </div>

          {/* HR between IDs */}
          {index < items.length - 1 && (
            <hr className="my-6 border-zinc-700" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
