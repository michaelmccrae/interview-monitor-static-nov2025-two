"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";

export default function LLMProcessor({ beforeLLM }) {
  const [afterLLM, setAfterLLM] = useState([]);
  const [processRunId, setProcessRunId] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const [marketData, setMarketData] = useState(null);
  const [isFetchingMarket, setIsFetchingMarket] = useState(false);

  const speakerTasksTriggered = useRef({ initial: false, refinement: false });
  const processedTurnIds = useRef(new Set());
  const processedGuestAnalysisIds = useRef(new Set());
  const processedTurnsCache = useRef([]);
  const globalLookupCache = useRef(new Set());

  // 🆕 ticker guard
  const processedTickerIds = useRef(new Set());

  const abortController = useRef(null);

  // -----------------------------
  // HELPERS
  // -----------------------------
  function safeDurationSeconds(t) {
    if (
      typeof t?.startBeginning !== "number" ||
      typeof t?.startEnd !== "number"
    )
      return 0;
    return Math.max(0, t.startEnd - t.startBeginning);
  }

  function buildSpeakerStats(turns) {
    const stats = {};
    for (const t of turns || []) {
      const s = t?.speaker;
      if (typeof s !== "number") continue;

      if (!stats[s]) stats[s] = { turns: 0, words: 0, duration: 0 };
      stats[s].turns += 1;
      stats[s].words += t?.numberOfWords ?? 0;
      stats[s].duration += safeDurationSeconds(t);
    }
    return stats;
  }

  function computeSpeakerCorrections(turns, opts = {}) {
    const SHORT_WORDS = opts.shortWords ?? 4;
    const corrections = {};

    if (!Array.isArray(turns) || turns.length < 3) return corrections;

    for (let i = 1; i < turns.length - 1; i++) {
      const cur = turns[i];
      const prev = turns[i - 1];
      const next = turns[i + 1];

      const curWords = cur?.numberOfWords ?? 999;

      if (
        curWords <= SHORT_WORDS &&
        typeof cur?.speaker === "number" &&
        prev?.speaker === next?.speaker &&
        cur.speaker !== prev.speaker &&
        cur?.ID != null
      ) {
        corrections[cur.ID] = prev.speaker;
      }
    }
    return corrections;
  }

  function inferRolesFromSpeech(turns, maxSpeakerIndex) {
    const bySpeaker = Array.from({ length: maxSpeakerIndex + 1 }, () => ({
      turns: 0,
      words: 0,
      questions: 0,
    }));

    for (const t of turns || []) {
      const s = t?.speaker;
      if (typeof s !== "number") continue;
      bySpeaker[s].turns += 1;
      bySpeaker[s].words += t?.numberOfWords ?? 0;
      if (t?.text?.includes("?")) bySpeaker[s].questions += 1;
    }

    const roles = new Array(maxSpeakerIndex + 1).fill("Participant");

    let dominant = 0;
    let maxWords = -1;
    bySpeaker.forEach((x, i) => {
      if (x.words > maxWords) {
        maxWords = x.words;
        dominant = i;
      }
    });

    bySpeaker.forEach((x, i) => {
      const qRate = x.questions / Math.max(1, x.turns);
      const avgWords = x.words / Math.max(1, x.turns);
      if (qRate >= 0.3 && x.turns >= 3) roles[i] = "Interviewer";
      else if (avgWords >= 45 && x.turns >= 3) roles[i] = "Guest";
    });

    if (
      roles.filter((r) => r === "Interviewer").length >= 1 &&
      roles[dominant] === "Participant"
    ) {
      roles[dominant] = "Guest";
    }

    return roles;
  }

  // -----------------------------
  // START / STOP
  // -----------------------------
  const handleRunProcessing = () => {
    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();

    setAfterLLM([]);
    speakerTasksTriggered.current = { initial: false, refinement: false };
    processedTurnIds.current.clear();
    processedTickerIds.current.clear();
    processedTurnsCache.current = [];
    globalLookupCache.current.clear();

    setIsProcessing(true);
    setProcessRunId((p) => p + 1);
  };

  const handleStopProcessing = () => {
    if (abortController.current) abortController.current.abort();
    setIsProcessing(false);
  };

  // -----------------------------
  // MAIN LOOP
  // -----------------------------
  useEffect(() => {
    if (!beforeLLM?.length || processRunId === 0) return;

    beforeLLM.forEach((turn, index) => {
      if (processedTurnIds.current.has(turn.ID)) return;
      processedTurnIds.current.add(turn.ID);

      async function runTurnAnalyses() {
        if (abortController.current?.signal.aborted) return;

        processedTurnsCache.current.push(turn);
        const count = processedTurnsCache.current.length;

        // Speaker timing unchanged
        if (count === 4 && !speakerTasksTriggered.current.initial) {
          speakerTasksTriggered.current.initial = true;
        }
        if (count === 25 && !speakerTasksTriggered.current.refinement) {
          speakerTasksTriggered.current.refinement = true;
        }

        const lookupPayload = {
          turn,
          ignoreList: Array.from(globalLookupCache.current),
        };

        const errorPayload = {
          turns: beforeLLM.slice(Math.max(0, index - 5), index + 1),
          marketContext: marketData || null,
        };

        const tasks = [
          { key: "lookup", url: "/api/lookup", payload: lookupPayload },
          { key: "error", url: "/api/error2", payload: errorPayload },

          // 🆕 TICKER — SAME PATTERN AS LOOKUP
          ...(processedTickerIds.current.has(turn.ID)
            ? []
            : [
                {
                  key: "ticker",
                  url: "/api/ticker",
                  payload: { turn },
                },
              ]),
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

            // Lookup cache unchanged
            if (task.key === "lookup" && json?.lookupTerm && json?.lookupType) {
              json.lookupTerm.forEach((term, i) => {
                const type = json.lookupType[i];
                if (term)
                  globalLookupCache.current.add(
                    `${type}:${term.toLowerCase()}`
                  );
              });
            }

            // 🆕 Ticker guard + logs
            if (task.key === "ticker" && json?.companyName) {
              processedTickerIds.current.add(turn.ID);
              console.log("📈 [Ticker]", {
                turnID: turn.ID,
                companies: json.companyName,
                tickers: json.ticker,
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
  // HANDLER: FETCH MARKET DATA
  // -----------------------------
  const handleFetchMarketData = async () => {
    console.log("💰 [LLMProcessor] Fetching market data...");

    setIsFetchingMarket(true);
    try {
      const res = await fetch("/api/market-data");
      const json = await res.json();

      setMarketData(json);
      console.log("✅ [MarketData] Loaded:", json);
    } catch (err) {
      console.error("❌ [MarketData] Fetch failed:", err);
      alert("Failed to load financial feed.");
    } finally {
      setIsFetchingMarket(false);
    }
  };

  // -----------------------------
  // UNIFY
  // -----------------------------
  const unifiedAfterLLM = useMemo(() => {
    const map = new Map();
    const others = [];

    afterLLM.forEach((item) => {
      if (item.ID != null) {
        map.set(item.ID, { ...map.get(item.ID), ...item });
      } else others.push(item);
    });

    return [...others, ...map.values()];
  }, [afterLLM]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(unifiedAfterLLM, null, 2));
    alert("Copied");
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
