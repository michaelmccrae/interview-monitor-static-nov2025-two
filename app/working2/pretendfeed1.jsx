"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import data from "../../lib/data/goldman.json";
import TestChild from "./testchild";

/* ───────────────────────────────────────────── */
/* Helpers                                       */
/* ───────────────────────────────────────────── */

function extractInterviewRoles(afterLLM) {
  const meta = afterLLM.find((x) => x.speakerRole);
  if (!meta) return null;

  const roles = meta.speakerRole.map(
    (r) => r?.[0]?.toLowerCase()
  );

  const interviewerIndex = roles.findIndex(
    (r) => r === "interviewer"
  );
  const guestIndex = roles.findIndex((r) => r === "guest");

  if (interviewerIndex === -1 || guestIndex === -1) {
    return null;
  }

  return {
    interviewerIndex,
    guestIndex,
    interviewerName: meta.speakerName?.[interviewerIndex],
    guestName: meta.speakerName?.[guestIndex],
  };
}

/* ───────────────────────────────────────────── */
/* Component                                    */
/* ───────────────────────────────────────────── */

export default function SimulatedDeepgramFeed({ intervalMs = 30 }) {
  const [mergedDG, setMergedDG] = useState([]);
  const [afterLLM, setAfterLLM] = useState([]);

  const indexRef = useRef(0);
  const timerRef = useRef(null);
  const startedRef = useRef(false);

  const speakerTasksTriggered = useRef(false);
  const lastProcessedTurn = useRef(-1);
  const lastResponseBatch = useRef(-1);

  /* ───────────────────────────────────────────── */
  /* Load words                                   */
  /* ───────────────────────────────────────────── */

  const words = useMemo(() => {
    const arr =
      data?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
    return [...arr].sort(
      (a, b) => (a.start ?? 0) - (b.start ?? 0)
    );
  }, []);

  /* ───────────────────────────────────────────── */
  /* Simulate live feed                            */
  /* ───────────────────────────────────────────── */

  const tick = () => {
    if (indexRef.current >= words.length) return;
    setMergedDG((p) => [...p, words[indexRef.current++]]);
    timerRef.current = setTimeout(tick, intervalMs);
  };

  useEffect(() => {
    if (!words.length || startedRef.current) return;
    startedRef.current = true;
    timerRef.current = setTimeout(tick, intervalMs);
    return () => clearTimeout(timerRef.current);
  }, [words.length, intervalMs]);

  /* ───────────────────────────────────────────── */
  /* Build beforeLLM                               */
  /* ───────────────────────────────────────────── */

  const beforeLLM = useMemo(() => {
    if (!mergedDG.length) return [];

    const groups = [];
    let speaker = mergedDG[0].speaker;
    let wordsAcc = [];
    let wordObjs = [];
    let start = mergedDG[0].start ?? 0;

    for (const w of mergedDG) {
      const text = w?.punctuated_word;
      if (!text) continue;

      if (w.speaker === speaker) {
        wordsAcc.push(text);
        wordObjs.push(w);
        continue;
      }

      groups.push({
        speaker,
        text: wordsAcc.join(" "),
        startBeginning: start,
        startEnd: wordObjs.at(-1)?.start ?? start,
      });

      speaker = w.speaker;
      wordsAcc = [text];
      wordObjs = [w];
      start = w.start ?? 0;
    }

    if (wordsAcc.length) {
      groups.push({
        speaker,
        text: wordsAcc.join(" "),
        startBeginning: start,
        startEnd: wordObjs.at(-1)?.start ?? start,
      });
    }

    return groups.map((g, i) => ({
      ...g,
      ID: i,
      numberOfWords: g.text.split(/\s+/).length,
    }));
  }, [mergedDG]);

  /* ───────────────────────────────────────────── */
  /* Speaker name + role (once)                    */
  /* ───────────────────────────────────────────── */

  useEffect(() => {
    if (beforeLLM.length < 4) return;
    if (speakerTasksTriggered.current) return;

    speakerTasksTriggered.current = true;

    async function runSpeakerTasks() {
      const slice = beforeLLM.slice(0, 5);

      const endpoints = [
        { key: "speakername", url: "/api/speakername" },
        { key: "speakerrole", url: "/api/speakerrole" },
      ];

      const results = await Promise.all(
        endpoints.map(async (e) => {
          const res = await fetch(e.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slice),
          });
          return res.json();
        })
      );

      setAfterLLM((p) => [...p, Object.assign({}, ...results)]);
    }

    runSpeakerTasks();
  }, [beforeLLM.length]);

  /* ───────────────────────────────────────────── */
  /* Per-turn lookup / error / followup            */
  /* ───────────────────────────────────────────── */

  useEffect(() => {
    if (beforeLLM.length < 2) return;

    const turn = beforeLLM[beforeLLM.length - 2];
    if (turn.ID === lastProcessedTurn.current) return;
    lastProcessedTurn.current = turn.ID;

    if (turn.numberOfWords < 5) return;

    async function runTurnTasks() {
      const endpoints = [
        { key: "lookup", url: "/api/lookup" },
        { key: "error", url: "/api/error" },
        { key: "followup", url: "/api/followup" },
      ];

      const results = await Promise.all(
        endpoints.map(async (e) => {
          const res = await fetch(e.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([turn]),
          });
          return { key: e.key, json: await res.json() };
        })
      );

      const merged = { ID: turn.ID };
      results.forEach((r) => (merged[r.key] = r.json));

      setAfterLLM((p) => [...p, merged]);
    }

    runTurnTasks();
  }, [beforeLLM.length]);

  /* ───────────────────────────────────────────── */
  /* /api/response — every 4 turns                 */
  /* ───────────────────────────────────────────── */

  useEffect(() => {
    if (beforeLLM.length < 4) return;

    const roles = extractInterviewRoles(afterLLM);
    if (!roles) return;

    const completed = beforeLLM.slice(0, beforeLLM.length - 1);
    const batchIndex = Math.floor(completed.length / 4);

    if (batchIndex <= lastResponseBatch.current) return;
    lastResponseBatch.current = batchIndex;

    const batch = completed.slice(
      batchIndex * 4,
      batchIndex * 4 + 4
    );

    async function runResponseBatch() {
      const results = [];

      for (const answerTurn of batch) {
        if (answerTurn.speaker !== roles.guestIndex) continue;

        const questionTurn = [...completed]
          .slice(0, answerTurn.ID)
          .reverse()
          .find(
            (t) => t.speaker === roles.interviewerIndex
          );

        if (!questionTurn) continue;

        const res = await fetch("/api/response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionText: questionTurn.text,
            answerText: answerTurn.text,
            interviewerName: roles.interviewerName,
            guestName: roles.guestName,
          }),
        });

        const json = await res.json();

        results.push({
          ID: answerTurn.ID,
          response: json,
        });
      }

      if (results.length) {
        setAfterLLM((p) => [...p, ...results]);
      }
    }

    runResponseBatch();
  }, [beforeLLM.length, afterLLM]);

  /* ───────────────────────────────────────────── */
  /* Render debug                                 */
  /* ───────────────────────────────────────────── */

  return (
    <div className="p-4 text-zinc-100">
      <TestChild beforeLLM={beforeLLM} afterLLM={afterLLM} />

      <h2>beforeLLM</h2>
      <pre className="bg-gray-100 p-3 text-sm overflow-auto">
        {JSON.stringify(beforeLLM, null, 2)}
      </pre>

      <h2>afterLLM</h2>
      <pre className="bg-gray-100 p-3 text-sm overflow-auto">
        {JSON.stringify(afterLLM, null, 2)}
      </pre>
    </div>
  );
}
