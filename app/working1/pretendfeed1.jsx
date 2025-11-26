"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import data from "../../lib/data/goldman.json";
import TestChild from './testchild'

export default function SimulatedDeepgramFeed({ intervalMs = 30 }) {
  const [mergedDG, setMergedDG] = useState([]);
  const [afterLLM, setAfterLLM] = useState([]);

  const speakerTasksTriggered = useRef(false);
  const indexRef = useRef(0);
  const timerRef = useRef(null);
  const startedRef = useRef(false);

  // NEW: Track which turn we already sent to /api/error + /api/lookup
  const lastProcessedTurn = useRef(-1);

  // -----------------------------
  // Load & sort Deepgram words
  // -----------------------------
  const words = useMemo(() => {
    const arr = data?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    return [...arr].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  }, []);

  // -----------------------------
  // Simulate live feed
  // -----------------------------
  const tick = () => {
    if (indexRef.current >= words.length) return;
    const nextWord = words[indexRef.current];
    indexRef.current++;
    setMergedDG((prev) => [...prev, nextWord]);
    timerRef.current = setTimeout(tick, intervalMs);
  };

  useEffect(() => {
    if (!words.length || startedRef.current) return;
    startedRef.current = true;
    timerRef.current = setTimeout(tick, intervalMs);
    return () => clearTimeout(timerRef.current);
  }, [words.length, intervalMs]);

  // -----------------------------
  // Group words into bubbles
  // -----------------------------
  const beforeLLM = useMemo(() => {
    if (!mergedDG.length) return [];

    const safeGroups = [];
    let currentSpeaker = mergedDG[0].speaker;
    let currentWords = [];
    let currentBubbleWords = [];
    let firstWordStart = mergedDG[0].start ?? 0;

    for (const w of mergedDG) {
      const word = w?.punctuated_word;
      if (!w || typeof word !== "string" || word.trim().length === 0) continue;

      if (w.speaker === currentSpeaker) {
        currentWords.push(word);
        currentBubbleWords.push(w);
        continue;
      }

      if (currentWords.length > 0) {
        const lastWordStart =
          currentBubbleWords[currentBubbleWords.length - 1]?.start ??
          firstWordStart;

        safeGroups.push({
          speaker: currentSpeaker,
          text: currentWords.join(" ").trim(),
          startBeginning: firstWordStart,
          startEnd: lastWordStart,
        });
      }

      currentSpeaker = w.speaker;
      currentWords = [word];
      currentBubbleWords = [w];
      firstWordStart = w.start ?? 0;
    }

    if (currentWords.length > 0) {
      const lastWordStart =
        currentBubbleWords[currentBubbleWords.length - 1]?.start ??
        firstWordStart;

      safeGroups.push({
        speaker: currentSpeaker,
        text: currentWords.join(" ").trim(),
        startBeginning: firstWordStart,
        startEnd: lastWordStart,
      });
    }

    return safeGroups.map((g, i) => ({
      ...g,
      ID: i,
      numberOfWords: g.text.trim().split(/\s+/).length,
    }));
  }, [mergedDG]);

  // ====================================================
  // RUN SPEAKERNAME + SPEAKERROLE WHEN 4 TURNS READY
  // ====================================================
  useEffect(() => {
    if (beforeLLM.length < 4) return;
    if (speakerTasksTriggered.current) return;

    speakerTasksTriggered.current = true;

    async function runSpeakerAnalyses() {
      const contextSlice = beforeLLM.slice(0, 5);
      console.log("📤 Sending speaker context:", contextSlice);

      const tasks = [
        { key: "speakername", url: "/api/speakername" },
        { key: "speakerrole", url: "/api/speakerrole" }
      ];

      const calls = tasks.map(async (task) => {
        const res = await fetch(task.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contextSlice),
        });

        const json = await res.json();
        console.log(`📥 ${task.key} returned:`, json);
        return { key: task.key, json };
      });

      const results = await Promise.allSettled(calls);

      const mergedSpeaker = { "metadata": "speaker name and speaker role" };

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.json) {
          Object.assign(mergedSpeaker, r.value.json);
        }
      }

      setAfterLLM((prev) => [...prev, mergedSpeaker]);
    }

    runSpeakerAnalyses();
  }, [beforeLLM.length]);

  // ====================================================
// PROCESS ONLY COMPLETED TURNS
// ====================================================
useEffect(() => {
  if (beforeLLM.length < 2) return;

  // Completed turn is the *previous* one
  const completedTurn = beforeLLM[beforeLLM.length - 2];

  // Prevent duplicate firing
  if (completedTurn.ID === lastProcessedTurn.current) return;
  lastProcessedTurn.current = completedTurn.ID;

  // Skip incomplete or trivial turns
  if (!completedTurn.text || completedTurn.numberOfWords < 5) {
    console.log("⏭ Skipping trivial turn:", completedTurn);
    return;
  }

  async function runTurnAnalyses() {
    console.log("📤 Processing completed turn:", completedTurn);

    const tasks = [
      { key: "lookup", url: "/api/lookup" },
      { key: "error", url: "/api/error" },
      { key: "followup", url: "/api/followup" }
    ];

    const calls = tasks.map(async (task) => {
      const res = await fetch(task.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([completedTurn])
      });

      const json = await res.json();
      console.log(`📥 ${task.key} returned:`, json);

      return { key: task.key, json };
    });

    const results = await Promise.allSettled(calls);

    const mergedTurn = { ID: completedTurn.ID };

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.json) {
        mergedTurn[r.value.key] = r.value.json;
      }
    }

    setAfterLLM((prev) => [...prev, mergedTurn]);
  }

  runTurnAnalyses();

}, [beforeLLM.length]);


  // -----------------------------
  // Render debug output
  // -----------------------------
  return (
    <div className="p-4">
      <TestChild beforeLLM={beforeLLM} afterLLM={afterLLM} />
      <h2>beforeLLM</h2>
      <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
        {JSON.stringify(beforeLLM, null, 2)}
      </pre>

      <h2>afterLLM (speakername+speakerrole+lookup+error)</h2>
      <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto">
        {JSON.stringify(afterLLM, null, 2)}
      </pre>
    </div>
  );
}
