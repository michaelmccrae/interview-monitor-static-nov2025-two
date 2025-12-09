"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Bubble from "./bubble1.jsx";
import registry from "@/lib/data2/index.json";
import Meta from './meta1'

function TranscriptContent() {
  const searchParams = useSearchParams();
  const activeKey = searchParams.get("key");

  const [loading, setLoading] = useState(false);
  const [beforellm, setbeforellm] = useState(null);
  const [afterllm, setafterllm] = useState(null);
  const [currentKey, setCurrentKey] = useState(null);

  useEffect(() => {
    if (activeKey && registry[activeKey]) {
      loadTranscript(activeKey);
    }
  }, [activeKey]);

  async function loadTranscript(key) {
    if (key === currentKey && beforellm) return;

    setLoading(true);
    setCurrentKey(key);

    const def = registry[key];
    if (!def) {
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

        <ul className="space-y-3">
          {Object.entries(registry).map(([key, item]) => {
            const isActive = key === activeKey;
            
            return (
              <li key={key} className="text-left">
                <Link
                  href={`?key=${key}`}
                  className={` ${
                    isActive 
                      ? "text-blue-900 font-bold " // Active Style (Red & Bold)
                      : "text-blue-600 hover:text-blue-800 underline" // Inactive Style
                  }`}
                >
                  {item.label || key}
                </Link>
                
                <span className="text-gray-600">
                  {" - "}{item.moreinfo}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* STATUS */}
      {loading && <div className="text-gray-600 animate-pulse">Loading transcript...</div>}

      {/* RENDER TRANSCRIPT */}
      {!loading && beforellm && afterllm && (
        <div className="mt-8 border-t pt-6">
          {/* <h2 className="text-lg font-semibold mb-3">
            Showing: {registry[currentKey]?.label}
          </h2> */}

          <Meta beforellm={beforellm} afterllm={afterllm} />

          <Bubble beforellm={beforellm} afterllm={afterllm} />
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading search parameters...</div>}>
      <TranscriptContent />
    </Suspense>
  );
}