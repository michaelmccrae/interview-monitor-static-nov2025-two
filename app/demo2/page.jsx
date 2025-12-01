"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation"; // 1. Import hook to read URL
import Display from "./display1.jsx";
import registry from "@/lib/data2/index.json";

export default function Page() {
  const searchParams = useSearchParams(); // 2. Get current URL params
  const activeKey = searchParams.get("key"); // 3. Read ?key=...

  const [loading, setLoading] = useState(false);
  const [beforellm, setbeforellm] = useState(null);
  const [afterllm, setafterllm] = useState(null);
  // We can derive currentKey from the URL now, but keeping state is fine for display
  const [currentKey, setCurrentKey] = useState(null); 

  // 4. Listen for URL changes. If URL has ?key=..., load that transcript
  useEffect(() => {
    if (activeKey && registry[activeKey]) {
      loadTranscript(activeKey);
    }
  }, [activeKey]);

  async function loadTranscript(key) {
    // Prevent reloading if we are already showing this key (optional optimization)
    if (key === currentKey && beforellm) return;

    setLoading(true);
    setCurrentKey(key);

    const def = registry[key];
    if (!def) {
      // No alert needed here usually, just don't load
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
        <h1 className="text-xl font-bold mb-4">Available Transcripts</h1>

        <ul className="space-y-4">
          {Object.entries(registry).map(([key, item]) => (
            <li key={key} className="flex flex-col items-start text-left">
              {/* 5. The Link Component */}
              <Link
                href={`?key=${key}`} // Updates URL to /transcripts?key=goldman1
                className="text-blue-600 underline hover:text-blue-800 text-lg font-medium"
              >
                {item.label || key}
              </Link>
              
              {/* 6. The Info Block (Left aligned, small font) */}
              <div className="text-sm text-gray-500 mt-1">
                {item.moreinfo}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* STATUS */}
      {loading && <div className="text-gray-600 animate-pulse">Loading transcript...</div>}

      {/* RENDER TRANSCRIPT */}
      {!loading && beforellm && afterllm && (
        <div className="mt-8 border-t pt-6">
          <h2 className="text-lg font-semibold mb-3">
            Showing: {registry[currentKey]?.label}
          </h2>

          <Display beforellm={beforellm} afterllm={afterllm} />
        </div>
      )}
    </div>
  );
}