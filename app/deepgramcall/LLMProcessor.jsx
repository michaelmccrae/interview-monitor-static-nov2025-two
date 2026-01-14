"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";

export default function LLMProcessor({ beforeLLM }) {
  const [afterLLM, setAfterLLM] = useState([]);
  const [processRunId, setProcessRunId] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const speakerTasksTriggered = useRef({ initial: false, refinement: false });
  const processedTurnIds = useRef(new Set());
  const processedResponseIds = useRef(new Set());
  
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
    processedResponseIds.current = new Set();
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
    console.log(`🎤 [LLMProcessor] Triggering Speaker Analysis (${mode}) on ${cleanContextTurns.length} turns`);

    // In refinement mode, we might only care about roles, but getting names again doesn't hurt for verification
    const tasks = [
      { key: "speakername", url: "/api/speakername" },
      { key: "speakerrole", url: "/api/speakerrole" },
    ];

    const calls = tasks.map(async (task) => {
      try {
        const res = await fetch(task.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cleanContextTurns),
          signal: abortController.current?.signal,
        });
        const json = await res.json();
        return { key: task.key, json };
      } catch (e) {
        if (e.name === "AbortError") return { key: task.key, aborted: true };
        console.error(`Error fetching ${task.key}`, e);
        return { key: task.key, json: null };
      }
    });

    const results = await Promise.allSettled(calls);
    if (abortController.current?.signal.aborted) return;

    // Create new metadata object from this run
    const newMetadata = { metadata: "speaker name and speaker role" };
    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.json) {
        Object.assign(newMetadata, r.value.json);
      }
    }
    
    // MERGE LOGIC: Update existing state instead of blindly appending
    setAfterLLM((prev) => {
      const existingMetaIndex = prev.findIndex(item => item.metadata === "speaker name and speaker role");
      
      if (existingMetaIndex === -1) {
        // First time finding metadata? Add it.
        return [...prev, newMetadata];
      }

      // Metadata already exists. Let's smartly merge.
      const updatedList = [...prev];
      const existingMeta = updatedList[existingMetaIndex];

      // Logic: If new run identifies an "Interviewer" that was previously "Guest" or "Undefined", take the new one.
      // This assumes later context (refinement) is more accurate for roles.
      if (newMetadata.speakerRole && existingMeta.speakerRole) {
         const mergedRoles = [...existingMeta.speakerRole];
         
         newMetadata.speakerRole.forEach((newRole, index) => {
             const oldRole = mergedRoles[index];
             
             // If the new analysis says "Interviewer" and the old one didn't, TRUST THE NEW ONE.
             // This solves the Joe Wiesenthal issue.
             if (newRole === "Interviewer" && oldRole !== "Interviewer") {
                 console.log(`✨ [LLMProcessor] Role Refinement: Speaker ${index} promoted to Interviewer.`);
                 mergedRoles[index] = newRole;
             } 
             // Fill undefined gaps
             else if ((!oldRole || oldRole === "Undefined") && newRole !== "Undefined") {
                 mergedRoles[index] = newRole;
             }
         });
         existingMeta.speakerRole = mergedRoles;
      }

      // Merge Names (usually Initial run is better for intros, but we can fill gaps)
      if (newMetadata.speakerName && existingMeta.speakerName) {
          const mergedNames = [...existingMeta.speakerName];
          newMetadata.speakerName.forEach((newName, index) => {
              if (newName && (!mergedNames[index] || mergedNames[index].includes("Unknown"))) {
                  mergedNames[index] = newName;
              }
          });
          existingMeta.speakerName = mergedNames;
      }

      // Update Timestamp
      existingMeta.speakerRoleTimestamp = new Date().toISOString();
      
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
  // MAIN LOOP
  // -----------------------------
  useEffect(() => {
    if (processRunId === 0 || !beforeLLM || beforeLLM.length === 0) return;

    beforeLLM.forEach((turn) => {
      if (processedTurnIds.current.has(turn.ID)) return;

      processedTurnIds.current.add(turn.ID);

      async function runTurnAnalyses() {
        let subjectResult = "Substantial"; 
        let isAdBool = false;

        // API calls commented out per your previous setup
        // ...

        if (abortController.current?.signal.aborted) return;

        // --- SPEAKER TRIGGER LOGIC (UPDATED) ---
        processedTurnsCache.current.push(turn);
        const count = processedTurnsCache.current.length;

        // TRIGGER 1: INITIAL PASS (Context 0-80)
        // Captures Intros and basic names
        if (count === 4 && !speakerTasksTriggered.current.initial) {
          speakerTasksTriggered.current.initial = true;
          const openingSequence = beforeLLM.slice(0, 80);
          console.log("🎤 [LLMProcessor] Triggering Initial Speaker ID (0-80)");
          runSpeakerAnalyses(openingSequence, "initial");
        }

        // TRIGGER 2: REFINEMENT PASS (Context 80-160)
        // Captures deep interview Q&A behavior (where Joe acts as Interviewer)
        if (count === 25 && !speakerTasksTriggered.current.refinement) {
           speakerTasksTriggered.current.refinement = true;
           // Ensure we have enough data
           if (beforeLLM.length > 80) {
               const middleSequence = beforeLLM.slice(80, 160); 
               console.log("🎤 [LLMProcessor] Triggering Refinement Speaker ID (80-160)");
               runSpeakerAnalyses(middleSequence, "refinement");
           }
        }

        // 3. STANDARD ANALYSIS
        const lookupPayload = {
            turn: turn,
            ignoreList: Array.from(globalLookupCache.current)
        };

        const tasks = [
          { key: "lookup", url: "/api/lookup", payload: lookupPayload },
          { key: "error", url: "/api/error", payload: [turn] },
          { key: "followup", url: "/api/followup", payload: [turn] },
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
                json.lookupTerm.forEach(term => {
                    if(term) globalLookupCache.current.add(term.toLowerCase());
                });
            }
            
            return { key: task.key, json };
          } catch (e) {
            if (e.name === "AbortError") return { key: task.key, aborted: true };
            return { key: task.key, json: null };
          }
        });

        const results = await Promise.allSettled(calls);
        if (abortController.current?.signal.aborted) return;

        const mergedTurn = { 
          ID: turn.ID, 
          subjectMatter: subjectResult,
          isAd: isAdBool
        };

        for (const r of results) {
          if (r.status === "fulfilled" && r.value?.json) {
            mergedTurn[r.value.key] = r.value.json;
          }
        }

        console.log(`✅ [LLMProcessor] Turn Analyzed (ID: ${turn.ID})`, mergedTurn);
        setAfterLLM((prev) => [...prev, mergedTurn]);
      }

      runTurnAnalyses();
    });
  }, [beforeLLM, processRunId]);

  // ... (Response Logic and Styles remain unchanged) ...
  // -----------------------------
  // RESPONSE LOGIC
  // -----------------------------
  useEffect(() => {
    if (processRunId === 0 || !currentMetadata || !currentMetadata.speakerRole) return;

    beforeLLM.forEach((turn, index) => {
      if (processedResponseIds.current.has(turn.ID)) return;

      const rawRole = currentMetadata.speakerRole[turn.speaker];
      let roleStr = Array.isArray(rawRole) ? rawRole[0] : rawRole;
      
      if (typeof roleStr !== "string") return;
      if (roleStr.toLowerCase() !== "guest") return;

      if (index === 0) return;
      const questionTurn = beforeLLM[index - 1];

      processedResponseIds.current.add(turn.ID);

      const payload = {
        questionText: questionTurn.text,
        answerText: turn.text,
        interviewerName: currentMetadata.speakerName?.[questionTurn.speaker] || "Interviewer",
        guestName: currentMetadata.speakerName?.[turn.speaker] || "Guest",
      };
      
      console.log(`💬 [LLMProcessor] Sending Response Analysis (ID: ${turn.ID})`);

      fetch("/api/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.current?.signal,
      })
        .then((res) => res.json())
        .then((json) => {
          if (abortController.current?.signal.aborted) return;
          console.log(`💬 [LLMProcessor] Response Analysis Received (ID: ${turn.ID})`, json);
          setAfterLLM((prev) => [...prev, { ID: turn.ID, response: json }]);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          console.error("Response API Error:", err);
        });
    });
  }, [beforeLLM, currentMetadata, processRunId]);

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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(unifiedAfterLLM, null, 2));
    alert("Processed JSON copied to clipboard");
  };

  const styles = {
    container: { marginTop: "20px", paddingTop: "20px", borderTop: "1px solid #333" },
    headerWrapper: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" },
    buttonGroup: { display: "flex", gap: "10px" },
    runButton: { padding: "8px 16px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
    stopButton: { padding: "8px 16px", backgroundColor: "#dc2626", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
    copyButton: { padding: "8px 16px", backgroundColor: "#333", color: "#fff", border: "1px solid #555", borderRadius: "4px", cursor: "pointer" },
    textarea: { width: "100%", height: "300px", backgroundColor: "#111", color: "#aaddaa", border: "1px solid #333", padding: "10px", fontSize: "12px", fontFamily: "monospace" },
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