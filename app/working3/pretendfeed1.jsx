"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import data from "../../lib/data/oddlots1.json";
import TestChild from './testchild'

export default function SimulatedDeepgramFeed({ intervalMs = 30 }) {
  const [mergedDG, setMergedDG] = useState([]);
  const [afterLLM, setAfterLLM] = useState([]);

  const speakerTasksTriggered = useRef(false);
  const indexRef = useRef(0);
  const timerRef = useRef(null);
  const startedRef = useRef(false);

  // Track processing status
  const lastProcessedTurn = useRef(-1); 
  const processedResponseIds = useRef(new Set()); 

  // -----------------------------
  // 1. DATA LOADING & SIMULATION
  // -----------------------------
  const words = useMemo(() => {
    const arr = data?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    return [...arr].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  }, []);

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
  // 2. BUBBLE GROUPING
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
        const lastWordStart = currentBubbleWords[currentBubbleWords.length - 1]?.start ?? firstWordStart;
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
      const lastWordStart = currentBubbleWords[currentBubbleWords.length - 1]?.start ?? firstWordStart;
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

  // -----------------------------
  // 3. HELPER: GET METADATA
  // -----------------------------
  const currentMetadata = useMemo(() => {
    return afterLLM.find(item => item.speakerName && item.speakerRole);
  }, [afterLLM]);


  // -----------------------------
  // 4. API LOGIC: Speaker ID
  // -----------------------------
  useEffect(() => {
    if (beforeLLM.length < 4) return;
    if (speakerTasksTriggered.current) return;

    speakerTasksTriggered.current = true;

    async function runSpeakerAnalyses() {
      const contextSlice = beforeLLM.slice(0, 5);
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

  // -----------------------------
  // 5. API LOGIC: Standard (Lookup/Error)
  // -----------------------------
  useEffect(() => {
    if (beforeLLM.length < 2) return;

    const completedTurnIndex = beforeLLM.length - 2;
    const completedTurn = beforeLLM[completedTurnIndex];

    if (completedTurn.ID === lastProcessedTurn.current) return;
    lastProcessedTurn.current = completedTurn.ID;

    if (!completedTurn.text || completedTurn.numberOfWords < 5) return;

    async function runTurnAnalyses() {
      const tasks = [
        { key: "lookup", url: "/api/lookup", payload: [completedTurn] },
        { key: "error", url: "/api/error", payload: [completedTurn] },
        { key: "followup", url: "/api/followup", payload: [completedTurn] }
      ];

      const calls = tasks.map(async (task) => {
        const res = await fetch(task.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task.payload)
        });
        const json = await res.json();
        return { key: task.key, json };
      });

      const results = await Promise.allSettled(calls);
      const mergedTurn = { ID: completedTurn.ID };

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.json) {
          mergedTurn[r.value.key] = r.value.json;
        }
      }
      // Simple Append - GroupBy will handle unification later
      setAfterLLM((prev) => [...prev, mergedTurn]);
    }

    runTurnAnalyses();
  }, [beforeLLM.length]);


  // -----------------------------
  // 6. API LOGIC: Response
  // -----------------------------
  useEffect(() => {
    if (!currentMetadata) return;

    const processableTurns = beforeLLM.slice(0, beforeLLM.length - 1);

    processableTurns.forEach((turn, index) => {
      if (processedResponseIds.current.has(turn.ID)) return;
      if (!turn.text || turn.numberOfWords < 5) return;

      const role = currentMetadata.speakerRole[turn.speaker];
      if (!role || role.toLowerCase() !== 'guest') return;

      if (index === 0) return; 
      const questionTurn = beforeLLM[index - 1];
      
      processedResponseIds.current.add(turn.ID);

      const payload = {
        questionText: questionTurn.text,
        answerText: turn.text,
        interviewerName: currentMetadata.speakerName[questionTurn.speaker] || "Interviewer",
        guestName: currentMetadata.speakerName[turn.speaker] || "Guest"
      };

      console.log(`⚡ Backfilling Response Analysis for Turn ${turn.ID}`);

      fetch("/api/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(json => {
        // Simple Append - GroupBy will handle unification later
        setAfterLLM(prev => [...prev, { ID: turn.ID, response: json }]);
      })
      .catch(err => {
        console.error("Response API Error:", err);
      });
    });

  }, [beforeLLM, currentMetadata]); 


  // ====================================================
  // 7. NEW: UNIFY / GROUP BY ID
  // This runs right before rendering to ensure perfect output
  // ====================================================
  const unifiedAfterLLM = useMemo(() => {
      const map = new Map();
      const others = []; // For metadata objects that don't have an ID

      afterLLM.forEach(item => {
          if (item.ID != null) {
              const existing = map.get(item.ID) || {};
              // Deep merge logic: Spread existing, then spread new item on top
              map.set(item.ID, { ...existing, ...item });
          } else {
              others.push(item);
          }
      });

      // Combine metadata items + unified turn items
      return [...others, ...Array.from(map.values())];
  }, [afterLLM]);


  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="p-4">
      {/* Pass the UNIFIED data to the child */}
      <TestChild beforeLLM={beforeLLM} afterLLM={unifiedAfterLLM} />
      
      <div className="mt-8 border-t pt-4">
         <h3 className="font-bold text-xs text-gray-500 uppercase">Debug State</h3>
         <div className="grid grid-cols-2 gap-4 text-xs mt-2">
            <div>
               <strong>beforeLLM (Count: {beforeLLM.length})</strong>
               <pre className="bg-gray-100 p-2 h-32 overflow-auto rounded mt-1">
                  {JSON.stringify(beforeLLM.map(t => ({ID: t.ID, role: t.speaker})), null, 2)}
               </pre>
            </div>
            <div>
               {/* Display the UNIFIED object here to confirm structure */}
               <strong>afterLLM (Unified)</strong>
               <pre className="bg-gray-100 p-2 h-32 overflow-auto rounded mt-1">
                  {JSON.stringify(unifiedAfterLLM, null, 2)}
               </pre>
            </div>
         </div>
      </div>
    </div>
  );
}