'use client';

import { useState, useMemo } from 'react';
import LLMProcessor from './LLMProcessor2';

export default function AudioAnalyzer() {
  const [file, setFile] = useState(null);
  const [jsonResult, setJsonResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // NEW: State to control when to trigger the Child Component
  const [startAI, setStartAI] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      // Reset states on new file selection
      setJsonResult(null);
      setStartAI(false);
    }
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select an MP3 file first.');
      return;
    }

    setLoading(true);
    setError('');
    setJsonResult(null);
    setStartAI(false); // Ensure AI doesn't run automatically

    try {
      const res = await fetch('/api/dpanalyze', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyze');
      setJsonResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // TRANSFORM RAW DEEPGRAM -> BEFORE_LLM
  // -----------------------------
  const beforeLLM = useMemo(() => {
    if (!jsonResult?.results?.channels?.[0]?.alternatives?.[0]?.words) return [];
    
    const words = jsonResult.results.channels[0].alternatives[0].words;
    if (!words.length) return [];

    const safeGroups = [];
    let currentSpeaker = words[0].speaker;
    let currentWords = [];
    let currentBubbleWords = [];
    let firstWordStart = words[0].start ?? 0;

    for (const w of words) {
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
  }, [jsonResult]);


  const copyBeforeLLM = () => {
    navigator.clipboard.writeText(JSON.stringify(beforeLLM, null, 2));
    alert('BeforeLLM JSON copied!');
  };

  // Dark mode styles
  const styles = {
    container: {
      padding: '20px',
      maxWidth: '900px',
      margin: '0 auto',
      fontFamily: 'monospace',
      color: '#e0e0e0',
    },
    form: { display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' },
    input: {
      flex: 1,
      padding: '8px',
      backgroundColor: '#222',
      color: '#fff',
      border: '1px solid #444',
      cursor: 'pointer',
    },
    button: {
      padding: '8px 16px',
      backgroundColor: '#333',
      color: '#fff',
      border: '1px solid #555',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    actionButton: {
      padding: '12px 24px',
      backgroundColor: '#2563eb', // Blue for primary action
      color: '#fff',
      border: 'none',
      cursor: 'pointer',
      fontSize: '14px',
      marginTop: '10px',
      borderRadius: '4px'
    },
    error: { color: '#ff6b6b', marginBottom: '10px' },
    section: { marginTop: '30px', borderTop: '1px solid #444', paddingTop: '20px' },
    headerWrapper: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
    textarea: {
      width: '100%',
      height: '250px', 
      backgroundColor: '#111',
      color: '#ccc',
      border: '1px solid #333',
      padding: '10px',
      fontSize: '12px',
    },
  };

  return (
    <div style={styles.container}>
      <h3>Deepgram Audio Upload Analyzer</h3>
      
      {/* 1. UPLOAD FORM */}
      <form onSubmit={handleAnalyze} style={styles.form}>
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          required
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Processing...' : 'Upload & Generate BeforeLLM'}
        </button>
      </form>

      {error && <div style={styles.error}>Error: {error}</div>}

      {/* 2. INTERMEDIATE STEP: BEFORE_LLM DISPLAY */}
      {beforeLLM.length > 0 && (
        <div style={styles.section}>
          <div style={styles.headerWrapper}>
            <strong>Step 1: BeforeLLM (Ready for Analysis)</strong>
            <button onClick={copyBeforeLLM} style={styles.button}>
              Copy BeforeLLM JSON
            </button>
          </div>
          
          <textarea
            readOnly
            value={JSON.stringify(beforeLLM, null, 2)}
            style={styles.textarea}
            spellCheck="false"
          />

          {/* THE TRIGGER BUTTON */}
          {!startAI ? (
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button 
                onClick={() => setStartAI(true)} 
                style={styles.actionButton}
              >
                Start AI Analysis &rarr;
              </button>
            </div>
          ) : (
             /* 3. FINAL STEP: CHILD PROCESSOR */
            <LLMProcessor beforeLLM={beforeLLM} />
          )}
        </div>
      )}
    </div>
  );
}