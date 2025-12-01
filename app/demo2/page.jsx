// app/transcripts/page.jsx
"use client";

import { useState } from "react";
import Display from "./display1.jsx";
import registry from "@/lib/data2/index.json";

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [beforellm, setbeforellm] = useState(null);
  const [afterllm, setafterllm] = useState(null);
  const [currentKey, setCurrentKey] = useState(null);

  async function loadTranscript(key) {
    setLoading(true);
    setCurrentKey(key);

    const def = registry[key];
    if (!def) {
      alert("Invalid transcript key: " + key);
      setLoading(false);
      return;
    }

    console.log("Loading transcript:", def);

    try {
      const beforeModule = await import(`@/lib/${def.before}`);
      const afterModule = await import(`@/lib/${def.after}`);

      setbeforellm(beforeModule.default);
      setafterllm(afterModule.default);
    } catch (err) {
      console.error("Error loading JSON:", err);
      alert("Failed to load transcript.");
    }

    setLoading(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* LIST OF AVAILABLE DATASETS */}
      <div>
        <h1 className="text-xl font-bold mb-2">Available Transcripts</h1>

        <ul className="space-y-2">
          {Object.entries(registry).map(([key, item]) => (
            <li key={key}>
              <button
                onClick={() => loadTranscript(key)}
                className="text-blue-600 underline hover:text-blue-800"
              >
                {item.label || key}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* STATUS */}
      {loading && <div className="text-gray-600">Loading transcript…</div>}

      {/* RENDER TRANSCRIPT */}
      {beforellm && afterllm && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3">
            Showing: {registry[currentKey]?.label}
          </h2>

          <Display beforellm={beforellm} afterllm={afterllm} />
        </div>
      )}
    </div>
  );
}
