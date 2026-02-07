"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";

export default function LLMProcessor({ beforeLLM }) {
  const [afterLLM, setAfterLLM] = useState([]);
  const [processRunId, setProcessRunId] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // New State for Financial Feed
  const [marketData, setMarketData] = useState(null);
  const [isFetchingMarket, setIsFetchingMarket] = useState(false);

  const speakerTasksTriggered = useRef({ initial: false, refinement: false });
  const processedTurnIds = useRef(new Set());
  const processedGuestAnalysisIds = useRef(new Set());
  const processedTurnsCache = useRef([]);
  const globalLookupCache = useRef(new Set());
  const abortController = useRef(null);

  // -----------------------------
  // ✅ NEW HELPERS: STATS / CORRECTION / ROLE INFERENCE
  // -----------------------------

  function safeDurationSeconds(t) {
    if (
      typeof t?.startBeginning !== "number" ||
      typeof t?.startEnd !== "number"
    )
      return 0;
    return Math.max(0, t.startEnd - t.startBeginning);
  }

  // Heatmap stats for each speaker index
  function buildSpeakerStats(turns) {
    const stats = {};
    for (const t of turns || []) {
      const s = t?.speaker;
      if (typeof s !== "number") continue;

      if (!stats[s]) {
        stats[s] = { turns: 0, words: 0, duration: 0 };
      }
      stats[s].turns += 1;
      stats[s].words +=
        typeof t?.numberOfWords === "number" ? t.numberOfWords : 0;
      stats[s].duration += safeDurationSeconds(t);
    }
    return stats;
  }

  // Simple diarization repair:
  // if a very short turn is "sandwiched" between same-speaker turns, remap it
  function computeSpeakerCorrections(turns, opts = {}) {
    const SHORT_WORDS = opts.shortWords ?? 4;
    const corrections = {}; // { [turnID]: correctedSpeakerIndex }

    if (!Array.isArray(turns) || turns.length < 3) return corrections;

    for (let i = 1; i < turns.length - 1; i++) {
      const cur = turns[i];
      const prev = turns[i - 1];
      const next = turns[i + 1];

      const curWords =
        typeof cur?.numberOfWords === "number" ? cur.numberOfWords : 999;

      if (curWords > SHORT_WORDS) continue;
      if (typeof cur?.speaker !== "number") continue;
      if (
        typeof prev?.speaker !== "number" ||
        typeof next?.speaker !== "number"
      )
        continue;

      // Sandwich rule: prev and next same speaker, current different -> correct it
      if (prev.speaker === next.speaker && cur.speaker !== prev.speaker) {
        if (cur?.ID != null) corrections[cur.ID] = prev.speaker;
      }
    }

    return corrections;
  }

  // Heuristic role inference (cheap, deterministic):
  // - high question rate -> Interviewer
  // - long average turns / lots of words -> Guest
  // - else Participant
  function inferRolesFromSpeech(turns, maxSpeakerIndex) {
    const bySpeaker = Array.from({ length: maxSpeakerIndex + 1 }, () => ({
      turns: 0,
      words: 0,
      questions: 0,
    }));

    for (const t of turns || []) {
      const s = t?.speaker;
      if (typeof s !== "number" || s < 0 || s > maxSpeakerIndex) continue;

      bySpeaker[s].turns += 1;
      bySpeaker[s].words +=
        typeof t?.numberOfWords === "number" ? t.numberOfWords : 0;
      if (typeof t?.text === "string" && t.text.includes("?"))
        bySpeaker[s].questions += 1;
    }

    const inferred = new Array(maxSpeakerIndex + 1).fill("Participant");

    // find the “dominant talker” as a weak guest hint
    let maxWords = -1;
    let dominantSpeaker = 0;
    bySpeaker.forEach((x, i) => {
      if (x.words > maxWords) {
        maxWords = x.words;
        dominantSpeaker = i;
      }
    });

    bySpeaker.forEach((x, i) => {
      const qRate = x.questions / Math.max(1, x.turns);
      const avgWords = x.words / Math.max(1, x.turns);

      if (qRate >= 0.3 && x.turns >= 3) inferred[i] = "Interviewer";
      else if (avgWords >= 45 && x.turns >= 3) inferred[i] = "Guest";
      else inferred[i] = "Participant";
    });

    // If we only inferred one Interviewer, tag the dominant talker as Guest (unless already interviewer)
    const interviewerCount = inferred.filter((r) => r === "Interviewer").length;
    if (interviewerCount >= 1 && inferred[dominantSpeaker] === "Participant") {
      inferred[dominantSpeaker] = "Guest";
    }

    return inferred;
  }

  // -----------------------------
  // HANDLER: FETCH MARKET DATA
  // -----------------------------
  const handleFetchMarketData = async () => {
    setIsFetchingMarket(true);
    try {
      const res = await fetch("/api/market-data");
      const json = await res.json();
      setMarketData(json);
      console.log("✅ Market Data Loaded:", json);
    } catch (err) {
      console.error("Failed to fetch market data:", err);
      alert("Failed to load financial feed.");
    } finally {
      setIsFetchingMarket(false);
    }
  };

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
    processedGuestAnalysisIds.current = new Set();
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
    if (abortController.current) abortController.current.abort();
    setIsProcessing(false);
  };

  // -----------------------------
  // HELPER: SPEAKER ANALYSIS
  // -----------------------------
  async function runSpeakerAnalyses(cleanContextTurns, mode = "initial") {
    const tasks = [
      { key: "speakername", url: "/api/speakername" },
      { key: "speakerrole", url: "/api/speakerrole" },
    ];
    console.log(`🎤 [LLMProcessor] Triggering Speaker Analysis (${mode})`);

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

    // -----------------------------
    // ✅ NEW: DERIVE STATS + CORRECTIONS + ROLE INFERENCE
    // -----------------------------
    const speakerStats = buildSpeakerStats(cleanContextTurns);

    const maxSpeakerIndex = Math.max(
      ...(cleanContextTurns || []).map((t) =>
        typeof t?.speaker === "number" ? t.speaker : -1
      )
    );

    const speakerCorrections =
      maxSpeakerIndex >= 0
        ? computeSpeakerCorrections(cleanContextTurns, { shortWords: 4 })
        : {};

    // Ensure arrays exist so TranscriptMerger metadata detection remains happy
    if (!Array.isArray(newMetadata.speakerName) && maxSpeakerIndex >= 0) {
      newMetadata.speakerName = new Array(maxSpeakerIndex + 1).fill(null);
    }
    if (!Array.isArray(newMetadata.speakerRole) && maxSpeakerIndex >= 0) {
      newMetadata.speakerRole = new Array(maxSpeakerIndex + 1).fill(
        "Undefined"
      );
    }

    // Fill missing/Undefined roles using heuristics (do not overwrite valid roles)
    if (maxSpeakerIndex >= 0) {
      const inferredRoles = inferRolesFromSpeech(
        cleanContextTurns,
        maxSpeakerIndex
      );
      newMetadata.speakerRole = newMetadata.speakerRole.map((role, i) => {
        if (!role || role === "Undefined")
          return inferredRoles[i] || "Participant";
        return role;
      });
    }

    // Attach new derived objects
    newMetadata.speakerStats = speakerStats;
    newMetadata.speakerCorrections = speakerCorrections;

    setAfterLLM((prev) => {
      const existingMetaIndex = prev.findIndex(
        (item) => item.metadata === "speaker name and speaker role"
      );
      if (existingMetaIndex === -1) return [...prev, newMetadata];

      const updatedList = [...prev];
      const existingMeta = updatedList[existingMetaIndex];

      // ---------------------------------------------------------
      // 🔥 FIX: STRICTER MERGE LOGIC (your existing)
      // ---------------------------------------------------------

      const isValidName = (name) => {
        if (!name || typeof name !== "string") return false;
        const n = name.trim().toLowerCase();
        if (n.startsWith("speaker") || n.startsWith("sp ")) return false;
        if (/^sp\d+$/.test(n)) return false;
        if (n === "undefined" || n === "unknown") return false;
        return true;
      };

      // 1. Merge Speaker Roles
      if (newMetadata.speakerRole && Array.isArray(newMetadata.speakerRole)) {
        if (!existingMeta.speakerRole) {
          existingMeta.speakerRole = newMetadata.speakerRole;
        } else {
          newMetadata.speakerRole.forEach((role, i) => {
            if (role && role !== "Undefined") {
              existingMeta.speakerRole[i] = role;
            }
          });
        }
      }

      // 2. Merge Speaker Names
      if (newMetadata.speakerName && Array.isArray(newMetadata.speakerName)) {
        if (!existingMeta.speakerName) {
          existingMeta.speakerName = newMetadata.speakerName;
        } else {
          newMetadata.speakerName.forEach((newName, i) => {
            const currentName = existingMeta.speakerName[i];

            if (isValidName(newName)) {
              if (!isValidName(currentName)) {
                existingMeta.speakerName[i] = newName;
              } else if (newName.length > currentName.length) {
                existingMeta.speakerName[i] = newName;
              }
            }
          });
        }
      }

      // -----------------------------
      // ✅ NEW: MERGE speakerStats + speakerCorrections
      // -----------------------------

      // stats: sum them across passes (opening + refinement)
      if (
        newMetadata.speakerStats &&
        typeof newMetadata.speakerStats === "object"
      ) {
        if (!existingMeta.speakerStats) existingMeta.speakerStats = {};
        for (const [k, v] of Object.entries(newMetadata.speakerStats)) {
          const key = String(k);
          if (!existingMeta.speakerStats[key]) {
            existingMeta.speakerStats[key] = {
              turns: 0,
              words: 0,
              duration: 0,
            };
          }
          existingMeta.speakerStats[key].turns += v.turns || 0;
          existingMeta.speakerStats[key].words += v.words || 0;
          existingMeta.speakerStats[key].duration += v.duration || 0;
        }
      }

      // corrections: first wins (don’t flip-flop)
      if (
        newMetadata.speakerCorrections &&
        typeof newMetadata.speakerCorrections === "object"
      ) {
        if (!existingMeta.speakerCorrections)
          existingMeta.speakerCorrections = {};
        for (const [turnId, spk] of Object.entries(
          newMetadata.speakerCorrections
        )) {
          if (existingMeta.speakerCorrections[turnId] == null) {
            existingMeta.speakerCorrections[turnId] = spk;
          }
        }
      }

      return updatedList;
    });
  }

  // -----------------------------
  // MAIN LOOP (LOOKUP & ERROR ONLY)
  // -----------------------------
  useEffect(() => {
    if (processRunId === 0 || !beforeLLM || beforeLLM.length === 0) return;

    beforeLLM.forEach((turn, index) => {
      if (processedTurnIds.current.has(turn.ID)) return;
      processedTurnIds.current.add(turn.ID);

      async function runTurnAnalyses() {
        if (abortController.current?.signal.aborted) return;

        // --- SPEAKER TRIGGER LOGIC ---
        processedTurnsCache.current.push(turn);
        const count = processedTurnsCache.current.length;

        if (count === 4 && !speakerTasksTriggered.current.initial) {
          speakerTasksTriggered.current.initial = true;
          const openingSequence = beforeLLM.slice(0, 200);
          runSpeakerAnalyses(openingSequence, "initial");
        }
        if (count === 25 && !speakerTasksTriggered.current.refinement) {
          speakerTasksTriggered.current.refinement = true;
          if (beforeLLM.length > 80) {
            const refinementSequence = beforeLLM.slice(0, 300);
            runSpeakerAnalyses(refinementSequence, "refinement");
          }
        }

        // 3. STANDARD ANALYSIS
        const lookupPayload = {
          turn: turn,
          ignoreList: Array.from(globalLookupCache.current),
        };

        // B. Prepare Error Payload (WITH CONTEXT AND MARKET DATA)
        const contextWindow = 5;
        const startIndex = Math.max(0, index - contextWindow);
        const errorPayload = {
          turns: beforeLLM.slice(startIndex, index + 1),
          marketContext: marketData || null,
        };

        const tasks = [
          { key: "lookup", url: "/api/lookup", payload: lookupPayload },
          { key: "error", url: "/api/error2", payload: errorPayload },
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
            if (task.key === "lookup" && json?.lookupTerm && json?.lookupType) {
              json.lookupTerm.forEach((term, i) => {
                const type = json.lookupType?.[i] ?? "UNKNOWN";
                if (term) {
                  globalLookupCache.current.add(
                    `${type}:${term.toLowerCase()}`
                  );
                }
              });
            }

            // ---------------------------------------
            // FINANCIAL ENRICHMENT (MINIMAL ADDITION)
            // ---------------------------------------
            if (task.key === "lookup" && json?.lookupTerm && json?.lookupType) {
              const financialEntities = json.lookupType
                .map((type, i) => ({
                  type,
                  term: json.lookupTerm[i],
                }))
                .filter(
                  (e) =>
                    e.type === "COMPANY" ||
                    e.type === "TICKER" ||
                    e.type === "COMMODITY"
                );

              if (financialEntities.length > 0) {
                try {
                  const finRes = await fetch("/api/financial-enrich", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entities: financialEntities }),
                    signal: abortController.current?.signal,
                  });

                  const finJson = await finRes.json();

                  // ✅ ONLY CHANGE: attach financial if present
                  if (finJson && Object.keys(finJson).length > 0) {
                    json.financial = finJson;
                  }
                } catch (err) {
                  console.warn("⚠️ Financial enrichment failed:", err);
                }
              }
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

        const mergedTurn = { ID: turn.ID };
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

  // -----------------------------
  // UNIFY (RESTORED – NO LOGIC CHANGE)
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

    return [...others, ...Array.from(map.values())];
  }, [afterLLM]);

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
    feedButton: {
      padding: "8px 16px",
      backgroundColor: marketData ? "#059669" : "#333",
      color: "#fff",
      border: marketData ? "1px solid #059669" : "1px solid #555",
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

          {/* FINANCIAL FEED BUTTON */}
          <button
            onClick={handleFetchMarketData}
            disabled={isFetchingMarket || isProcessing}
            style={styles.feedButton}
          >
            {isFetchingMarket
              ? "Loading Data..."
              : marketData
              ? "✓ Financial Feed Active"
              : "+ Add Financial Feed"}
          </button>
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
