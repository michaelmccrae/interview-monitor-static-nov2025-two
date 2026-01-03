'use client';

import React, { useEffect, useState } from 'react';
import data from './data.json';

export default function TranscriptDisplay() {
  // Store assessments keyed by Turn ID (or index if no ID exists)
  const [assessments, setAssessments] = useState({});
  const [loadingIds, setLoadingIds] = useState(new Set());

  // Helper: Get Speaker Name
  const getSpeakerName = (speakerIndex) => {
    return data.metadata.speakerName[speakerIndex] || `Speaker ${speakerIndex}`;
  };

  // Helper: Get Speaker Role
  const getSpeakerRole = (speakerIndex) => {
    return data.metadata.speakerRole[speakerIndex]; // 'interviewer' or 'guest'
  };

  useEffect(() => {
    console.log("🚀 [Step 1] Component Mounted. Starting useEffect...");
    console.log("📂 [Step 1] Raw Data Loaded:", data);

    const fetchAllAssessments = async () => {
      // 1. Identify all turns that need analysis (Guest turns)
      const guestTurnsToAnalyze = data.turns.map((turn, index) => {
        // Find if this turn is by a guest
        const role = getSpeakerRole(turn.speaker);
        
        // Log skipped turns to show filtering logic
        if (role !== 'guest') {
            // console.log(`⏩ [Step 2] Skipping Turn ${index} (Interviewer)`);
            return null;
        }

        // Find the preceding turn (the question)
        const previousTurn = index > 0 ? data.turns[index - 1] : null;
        
        const payload = {
          turn,
          index, // Using index as ID if turn.ID is missing
          questionText: previousTurn ? previousTurn.text : "No prior question context.",
          answerText: turn.text,
          guestName: getSpeakerName(turn.speaker),
          // Attempt to get interviewer name from previous turn, default to generic
          interviewerName: previousTurn ? getSpeakerName(previousTurn.speaker) : "Interviewer"
        };

        console.log(`✅ [Step 2] Found Guest Turn to Analyze (ID: ${turn.ID || index}):`, payload);
        return payload;
      }).filter(item => item !== null);

      console.log(`📋 [Step 3] Total turns to process: ${guestTurnsToAnalyze.length}`);

      // 2. Fire API calls
      guestTurnsToAnalyze.forEach(async (item) => {
        const turnId = item.turn.ID !== undefined ? item.turn.ID : item.index;

        // Mark as loading
        setLoadingIds(prev => new Set(prev).add(turnId));

        const apiPayload = {
            questionText: item.questionText,
            answerText: item.answerText,
            interviewerName: item.interviewerName,
            guestName: item.guestName
        };

        console.log(`📡 [Step 4] Sending API Request for Turn ${turnId}...`, apiPayload);

        try {
          const res = await fetch('/api/response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayload),
          });

          if (res.ok) {
            const result = await res.json();
            console.log(`📥 [Step 5] Received Success Response for Turn ${turnId}:`, result);
            
            setAssessments(prev => ({
              ...prev,
              [turnId]: result
            }));
          } else {
             console.error(`❌ [Step 5] API Error for Turn ${turnId}: Status ${res.status}`);
          }
        } catch (error) {
          console.error(`❌ [Step 5] Network/Code Error analyzing turn ${turnId}:`, error);
        } finally {
          setLoadingIds(prev => {
            const next = new Set(prev);
            next.delete(turnId);
            return next;
          });
          console.log(`🏁 [Step 6] Finished processing Turn ${turnId}`);
        }
      });
    };

    fetchAllAssessments();
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto text-zinc-800 dark:text-zinc-200">
      <h1 className="text-3xl font-bold mb-8">Interview Assessment</h1>
      
      <div className="space-y-8 mb-12">
        {data.turns.map((turn, index) => {
          const name = getSpeakerName(turn.speaker);
          const role = getSpeakerRole(turn.speaker);
          const isInterviewer = role === 'interviewer';
          const turnId = turn.ID !== undefined ? turn.ID : index;
          const assessment = assessments[turnId];
          const isLoading = loadingIds.has(turnId);

          // ... imports and logic remain the same ...

// Inside your return (...) JSX map function:
// ...
          return (
            <div key={turnId} className={`flex flex-col ${isInterviewer ? 'items-start' : 'items-start pl-8 border-l-2 border-zinc-600'}`}>
              
              {/* Speaker Label */}
              <div className="font-bold text-sm text-zinc-500 uppercase tracking-wide mb-1">
                {name} {isInterviewer ? '(Interviewer)' : '(Guest)'}
              </div>

              {/* Transcript Text */}
              <div className="bg-zinc-100 dark:bg-zinc-900 p-4 rounded-lg shadow-sm text-lg leading-relaxed mb-2 w-full">
                {turn.text}
              </div>

              {/* Assessment Block (Only for Guests) */}
              {!isInterviewer && (
                <div className="w-full mt-2">
                  {isLoading && (
                    <div className="text-sm text-zinc-500 animate-pulse">
                      Assessing response...
                    </div>
                  )}
                  
                  {assessment && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 p-4 rounded-md text-sm">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold text-blue-600 dark:text-blue-400 uppercase text-xs">
                          AI Assessment
                        </span>
                        
                        {/* CHANGED: .score -> .responseScore */}
                        <span className={`font-bold ${assessment.responseScore >= 0.8 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          Score: {(assessment.responseScore * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* CHANGED: .summation -> .responseSummation */}
                      <p className="text-zinc-700 dark:text-zinc-300">
                        {assessment.responseSummation}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
// ...
        })}
      </div>
    </div>
  );
}