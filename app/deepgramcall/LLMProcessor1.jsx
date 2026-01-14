"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";

export default function LLMProcessor({ beforeLLM }) {
  const [afterLLM, setAfterLLM] = useState([]);
  const [processRunId, setProcessRunId] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const speakerTasksTriggered = useRef({ initial: false, refinement: false });
  const processedTurnIds = useRef(new Set());

  // Track IDs specifically for the Guest-Only analysis (Followup + Response)
  const processedGuestAnalysisIds = useRef(new Set());

  const processedTurnsCache = useRef([]);
  const globalLookupCache = useRef(new Set());

  // ABORT CONTROLLER REF
  const abortController = useRef(null);

  // -----------------------------
  // HANDLER: START
  // -----------------------------
  const handleRunProcessing = () => {
    console.log("🚀 [LLMProcessor] Starting Processing Run...");

    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();

    setAfterLLM([]);
    speakerTasksTriggered.current = { initial: false, refinement: false };
    processedTurnIds.current = new Set();
    processedGuestAnalysisIds.current = new Set(); // Reset guest tracker
    processedTurnsCache.current = [];

    globalLookupCache.current = new Set();

    setIsProcessing(true);
    setProcessRunId((prev) => prev + 1);
  };

  // -----------------------------
  // HANDLER: STOP
  // -----------------------------
  const handleStopProcessing = () => {
    console.log("🛑 [LLMProcessor] Stopping Processing.");
    if (abortController.current) {
      abortController.current.abort();
    }
    setIsProcessing(false);
  };

  // -----------------------------
  // HELPER: SPEAKER ANALYSIS
  // -----------------------------
  async function runSpeakerAnalyses(cleanContextTurns, mode = "initial") {
    // ... (This function remains exactly the same as your code) ...
    // Note: I am omitting the body here to save space, but keep your
    // existing runSpeakerAnalyses logic exactly as is.

    const tasks = [
      { key: "speakername", url: "/api/speakername" },
      { key: "speakerrole", url: "/api/speakerrole" },
    ];
    // ... standard fetch logic ...
    // ... merge logic ...
    // (Ensure you keep the implementation you provided in the prompt)
    console.log(`🎤 [LLMProcessor] Triggering Speaker Analysis (${mode})`);
    // Placeholder for your existing implementation
    const calls = tasks.map(async (task) => {
      try {
        const res = await fetch(task.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cleanContextTurns),
          signal: abortController.current?.signal,
        });
        return { key: task.key, json: await res.json() };
      } catch (e) {
        return { key: task.key, json: null };
      }
    });

    const results = await Promise.allSettled(calls);
    if (abortController.current?.signal.aborted) return;

    const newMetadata = { metadata: "speaker name and speaker role" };
    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.json) {
        Object.assign(newMetadata, r.value.json);
      }
    }

    setAfterLLM((prev) => {
      const existingMetaIndex = prev.findIndex(
        (item) => item.metadata === "speaker name and speaker role"
      );
      if (existingMetaIndex === -1) return [...prev, newMetadata];

      const updatedList = [...prev];
      const existingMeta = updatedList[existingMetaIndex];

      // Simple merge for brevity in this snippet - use your advanced merge logic here
      if (newMetadata.speakerRole)
        existingMeta.speakerRole = newMetadata.speakerRole;
      if (newMetadata.speakerName)
        existingMeta.speakerName = newMetadata.speakerName;

      return updatedList;
    });
  }

  // -----------------------------
  // HELPER: GET METADATA
  // -----------------------------
  const currentMetadata = useMemo(() => {
    return afterLLM.find((item) => item.speakerName && item.speakerRole);
  }, [afterLLM]);

  // -----------------------------
  // MAIN LOOP (LOOKUP & ERROR ONLY)
  // -----------------------------
  // Note: Follow-up was REMOVED from here
  useEffect(() => {
    if (processRunId === 0 || !beforeLLM || beforeLLM.length === 0) return;

    beforeLLM.forEach((turn) => {
      if (processedTurnIds.current.has(turn.ID)) return;

      processedTurnIds.current.add(turn.ID);

      async function runTurnAnalyses() {
        let subjectResult = "Substantial";
        let isAdBool = false;

        if (abortController.current?.signal.aborted) return;

        // --- SPEAKER TRIGGER LOGIC ---
        processedTurnsCache.current.push(turn);
        const count = processedTurnsCache.current.length;

        if (count === 4 && !speakerTasksTriggered.current.initial) {
          speakerTasksTriggered.current.initial = true;
          const openingSequence = beforeLLM.slice(0, 80);
          runSpeakerAnalyses(openingSequence, "initial");
        }

        if (count === 25 && !speakerTasksTriggered.current.refinement) {
          speakerTasksTriggered.current.refinement = true;
          if (beforeLLM.length > 80) {
            const middleSequence = beforeLLM.slice(80, 160);
            runSpeakerAnalyses(middleSequence, "refinement");
          }
        }

        // 3. STANDARD ANALYSIS (Lookup & Error Only)
        // REMOVED 'followup' from this list
        const lookupPayload = {
          turn: turn,
          ignoreList: Array.from(globalLookupCache.current),
        };

        const tasks = [
          { key: "lookup", url: "/api/lookup", payload: lookupPayload },
          { key: "error", url: "/api/error", payload: [turn] },
        ];

        const calls = tasks.map(async (task) => {
          try {
            const res = await fetch(task.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(task.payload),
              signal: abortController.current?.signal,
            });
            const json = await res.json();

            if (task.key === "lookup" && json?.lookupTerm) {
              json.lookupTerm.forEach((term) => {
                if (term) globalLookupCache.current.add(term.toLowerCase());
              });
            }

            return { key: task.key, json };
          } catch (e) {
            if (e.name === "AbortError")
              return { key: task.key, aborted: true };
            return { key: task.key, json: null };
          }
        });

        const results = await Promise.allSettled(calls);
        if (abortController.current?.signal.aborted) return;

        const mergedTurn = {
          ID: turn.ID,
          subjectMatter: subjectResult,
          isAd: isAdBool,
        };

        for (const r of results) {
          if (r.status === "fulfilled" && r.value?.json) {
            mergedTurn[r.value.key] = r.value.json;
          }
        }

        setAfterLLM((prev) => [...prev, mergedTurn]);
      }

      runTurnAnalyses();
    });
  }, [beforeLLM, processRunId]);

  // -------------------------------------------------------------
  // SECONDARY LOOP: FOLLOWUP + RESPONSE (ROLE-AGNOSTIC)
  // -------------------------------------------------------------
  useEffect(() => {
    if (processRunId === 0 || !beforeLLM?.length) return;

    beforeLLM.forEach((turn, index) => {
      if (processedGuestAnalysisIds.current.has(turn.ID)) return;
      if (index === 0) return;

      processedGuestAnalysisIds.current.add(turn.ID);

      const startIdx = Math.max(0, index - 4);
      const contextTurns = beforeLLM.slice(startIdx, index + 1);

      const payload = {
        targetTurnID: turn.ID,
        contextTurns,
      };

      console.log(`🔎 Followup/Response analysis for turn ${turn.ID}`);

      const responseReq = fetch("/api/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.current?.signal,
      }).then((res) => res.json());

      const followupReq = fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.current?.signal,
      }).then((res) => res.json());

      Promise.allSettled([responseReq, followupReq]).then((results) => {
        if (abortController.current?.signal.aborted) return;

        const updates = {};

        results.forEach((r) => {
          if (r.status === "fulfilled" && r.value && !r.value.error) {
            if (r.value.responseScore != null) updates.response = r.value;
            if (r.value.followupQuestion != null) updates.followup = r.value;
          }
        });

        if (Object.keys(updates).length > 0) {
          setAfterLLM((prev) => [...prev, { ID: turn.ID, ...updates }]);
        }
      });
    });
  }, [beforeLLM, processRunId]);

  // -----------------------------
  // UNIFY
  // -----------------------------
  const unifiedAfterLLM = useMemo(() => {
    const map = new Map();
    const others = [];
    afterLLM.forEach((item) => {
      if (item.ID != null) {
        const existing = map.get(item.ID) || {};
        map.set(item.ID, { ...existing, ...item });
      } else {
        others.push(item);
      }
    });

    const result = [...others, ...Array.from(map.values())];
    return result;
  }, [afterLLM]);

  // ... (Render and Styles remain unchanged) ...
  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(unifiedAfterLLM, null, 2));
    alert("Processed JSON copied to clipboard");
  };

  const styles = {
    container: {
      marginTop: "20px",
      paddingTop: "20px",
      borderTop: "1px solid #333",
    },
    headerWrapper: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "10px",
    },
    buttonGroup: { display: "flex", gap: "10px" },
    runButton: {
      padding: "8px 16px",
      backgroundColor: "#2563eb",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
    },
    stopButton: {
      padding: "8px 16px",
      backgroundColor: "#dc2626",
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
    },
    copyButton: {
      padding: "8px 16px",
      backgroundColor: "#333",
      color: "#fff",
      border: "1px solid #555",
      borderRadius: "4px",
      cursor: "pointer",
    },
    textarea: {
      width: "100%",
      height: "300px",
      backgroundColor: "#111",
      color: "#aaddaa",
      border: "1px solid #333",
      padding: "10px",
      fontSize: "12px",
      fontFamily: "monospace",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerWrapper}>
        <div style={styles.buttonGroup}>
          {!isProcessing ? (
            <button onClick={handleRunProcessing} style={styles.runButton}>
              {processRunId === 0 ? "▶ Run AI Analysis" : "↻ Re-Run Analysis"}
            </button>
          ) : (
            <button onClick={handleStopProcessing} style={styles.stopButton}>
              ⏹ Stop Processing
            </button>
          )}
        </div>
        {unifiedAfterLLM.length > 0 && (
          <button onClick={copyToClipboard} style={styles.copyButton}>
            Copy Output
          </button>
        )}
      </div>

      <textarea
        readOnly
        value={
          processRunId === 0
            ? "Ready to process. Click 'Run AI Analysis' to start."
            : JSON.stringify(unifiedAfterLLM, null, 2)
        }
        style={styles.textarea}
        spellCheck="false"
      />
    </div>
  );
}
