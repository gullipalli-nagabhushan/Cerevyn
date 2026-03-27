import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Mic, MicOff, RotateCcw, Play, Square, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './App.css';

// --- CUSTOM COMPONENTS ---

function CustomSelect({ value, onChange, options, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayValue = Array.isArray(options)
    ? (typeof options[0] === 'object' ? options.find(o => o.value === value)?.label : value)
    : options[value] || value;

  return (
    <div className="custom-select-container" ref={containerRef}>
      <div
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{displayValue}</span>
        <ChevronDown size={18} className={`chevron ${isOpen ? 'up' : ''}`} />
      </div>

      {isOpen && (
        <div className="custom-select-options">
          {Array.isArray(options) ? options.map((opt, i) => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const lbl = typeof opt === 'object' ? opt.label : opt;
            return (
              <div
                key={i}
                className={`custom-select-option ${value === val ? 'selected' : ''}`}
                onClick={() => {
                  onChange(val);
                  setIsOpen(false);
                }}
              >
                {lbl}
              </div>
            );
          }) : Object.entries(options).map(([val, lbl], i) => (
            <div
              key={i}
              className={`custom-select-option ${value === val ? 'selected' : ''}`}
              onClick={() => {
                onChange(val);
                setIsOpen(false);
              }}
            >
              {lbl}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-key-123';

const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// --- CUSTOM HOOKS ---

function useSettings() {
  const [engine, setEngine] = useState('orpheus'); // orpheus, ai4bharat, gtts
  const [gender, setGender] = useState('female');
  const [accent, setAccent] = useState('en-US');
  const [voice, setVoice] = useState('hannah');
  const [tone, setTone] = useState('professional');
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);

  return { engine, setEngine, gender, setGender, accent, setAccent, voice, setVoice, tone, setTone, speed, setSpeed, pitch, setPitch };
}

const TTS_DATA = {
  orpheus: {
    name: "Groq Orpheus (Premium English)",
    female: ["hannah", "diana", "autumn"],
    male: ["austin", "daniel", "troy"]
  },
  ai4bharat: {
    name: "AI4Bharat (Premium Indic)",
    female: ["Standard Female"],
    male: ["Standard Male"]
  },
  gtts: {
    name: "gTTS (Standard Fallback)",
    female: ["Default Female"],
    male: ["Default Male"]
  }
};

function useConversation() {
  const [history, setHistory] = useState([]);
  const addTurn = useCallback((role, content) => {
    setHistory(prev => {
      const newHistory = [...prev, { role, content }];
      return newHistory.slice(-12); // Keep last 6 turns (12 messages)
    });
  }, []);
  const clear = () => setHistory([]);
  return { history, setHistory, addTurn, clear };
}

function useVoiceState() {
  const [state, setState] = useState('idle'); // idle, listening, processing, speaking
  return { state, setState };
}

function useMediaRecorder(onStop) {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const chunksRef = useRef([]);

  const preWarm = async () => {
    if (!streamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
  };

  const startRecording = async () => {
    chunksRef.current = [];
    if (!streamRef.current) await preWarm();

    // Ensure AudioContext is active (critical for iOS)
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const stream = streamRef.current;
    const audioContext = audioContextRef.current;

    // VAD Logic
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 512;
    source.connect(analyzer);
    const buffer = new Uint8Array(analyzer.frequencyBinCount);

    let silenceStart = Date.now();
    const checkSilence = () => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
      analyzer.getByteFrequencyData(buffer);
      const volume = buffer.reduce((a, b) => a + b) / buffer.length;

      const threshold = isMobile() ? 12 : 5; // Higher threshold on mobile to ignore noise
      if (volume > threshold) { // Threshold for "talking"
        silenceStart = Date.now();
      } else if (Date.now() - silenceStart > 1000) { // 1.0s silence
        stopRecording();
        return;
      }
      requestAnimationFrame(checkSilence);
    };

    mediaRecorderRef.current = new MediaRecorder(stream);
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorderRef.current.onstop = () => {
      // Determine format (Mobile compatibility)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onStop(blob);
      source.disconnect();
      analyzer.disconnect();
    };
    mediaRecorderRef.current.start();
    requestAnimationFrame(checkSilence);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Keep tracks alive for faster restart
    }
  };

  return { startRecording, stopRecording, preWarm };
}

// --- MAIN COMPONENT ---

function App() {
  const { state, setState } = useVoiceState();
  const settings = useSettings();
  const { history, setHistory, addTurn, clear } = useConversation();
  const [isLive, setIsLive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const chatEndRef = useRef(null);
  const chatWindowRef = useRef(null);
  const activeAudioRef = useRef(null);
  const isLiveRef = useRef(false); // For use in async closures

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const stopAudio = (skipStateUpdate = false) => {
    // If called from an event handler, skipStateUpdate might be the event object
    const shouldSkip = typeof skipStateUpdate === 'boolean' ? skipStateUpdate : false;

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    audioResultsRef.current = {};
    nextToPlayRef.current = 0;
    isPlayingQueueRef.current = false;

    if (!shouldSkip && state === 'speaking') {
      setState('idle');
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  useEffect(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.playbackRate = settings.speed;
    }
  }, [settings.speed]);

  const handleAudioBlob = async (blob) => {
    if (blob.size < 500) {
      console.warn("Audio blob too small, ignoring:", blob.size);
      return;
    }
    stopAudio(); // Stop any previous speech
    nextToPlayRef.current = 0; // Reset queue index for new turn
    audioResultsRef.current = {}; // Clear any stale audio
    setState('processing');
    try {
      // 1. Transcribe
      const formData = new FormData();
      formData.append('audio', blob, 'audio.wav');
      formData.append('tone', settings.tone);
      formData.append('language', settings.accent.split('-')[0]);

      const transcribeRes = await fetch(`${BASE_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
        headers: { 'X-API-Key': API_KEY }
      });
      const { transcript, language } = await transcribeRes.json();
      setLiveTranscript(transcript);
      addTurn('user', transcript);

      // 2. Chat & Speak Pipeline
      const chatRes = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          prompt: transcript,
          tone: settings.tone,
          language: settings.accent.split('-')[0],
          model: settings.model,
          history
        })
      });

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let currentSentenceText = "";
      let sentenceIndex = 0;

      // Add placeholder for assistant response
      setHistory(prev => [...prev, { role: 'assistant', content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        currentSentenceText += chunk;

        // Update UI
        setHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1].content = fullText;
          return newHistory;
        });

        // Instant trigger on punctuation or newline
        if (/[.!?\n]/.test(chunk)) {
          const textToSpeak = currentSentenceText.trim();
          if (textToSpeak.length > 2) {
            triggerSpeech(textToSpeak, sentenceIndex++);
            currentSentenceText = "";
          }
        }
      }

      // Finalize anything left
      if (currentSentenceText.trim().length > 0) {
        triggerSpeech(currentSentenceText.trim(), sentenceIndex++);
      }

      setState('idle');
    } catch (err) {
      console.error(err);
      setState('idle');
    }
  };

  const audioResultsRef = useRef({}); // index -> blob
  const nextToPlayRef = useRef(0);
  const isPlayingQueueRef = useRef(false);

  const processQueue = async () => {
    if (isPlayingQueueRef.current) return;
    isPlayingQueueRef.current = true;

    while (true) {
      const index = nextToPlayRef.current;
      const blob = audioResultsRef.current[index];
      if (!blob) break;

      setState('speaking');
      await playAudio(blob);
      delete audioResultsRef.current[index];
      nextToPlayRef.current++;
    }

    isPlayingQueueRef.current = false;
    setState('idle');
  };

  const triggerSpeech = async (text, index = 0) => {
    try {
      const response = await fetch(`${BASE_URL}/api/speak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          text,
          engine: settings.engine,
          gender: settings.gender,
          accent: settings.accent,
          voice: settings.voice,
          speed: settings.speed,
          pitch: settings.pitch,
          tone: settings.tone
        })
      });

      const usedAccent = response.headers.get('X-Used-Accent');
      if (usedAccent && usedAccent !== settings.accent) {
        settings.setAccent(usedAccent);
      }

      const audioBlob = await response.blob();
      audioResultsRef.current[index] = audioBlob;
      processQueue();
    } catch (e) { console.error("Speech Trigger Error:", e); }
  };

  const { startRecording, stopRecording, preWarm } = useMediaRecorder(handleAudioBlob);

  const playAudio = (blob) => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = settings.speed;
      activeAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        activeAudioRef.current = null;
        resolve();
      };
      audio.onerror = (e) => {
        console.error("Audio Playback Error:", e);
        resolve();
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.error("Autoplay/Play Error:", e);
          resolve();
        });
      }
    });
  };

  // Gemini Live State Machine
  useEffect(() => {
    if (!isLive) return;

    if (state === 'idle') {
      const timer = setTimeout(() => {
        if (state === 'idle' && isLive) {
          startRecording();
          setState('listening');
        }
      }, 50); // Immediate restart
      return () => clearTimeout(timer);
    }
  }, [state, isLive]);

  const toggleMic = () => {
    if (isLive) {
      setIsLive(false);
      isLiveRef.current = false;
      stopRecording();
      // Stop tracks to release microphone
      if (activeAudioRef.current) activeAudioRef.current.pause();
      if (mediaRecorderRef.current?.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
      stopAudio();
      setState('idle');
    } else {
      setIsLive(true);
      isLiveRef.current = true;
      stopAudio();
      preWarm(); // Pre-warm the stream
      startRecording();
      setState('listening');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Space or Tab to toggle/stop
      if (e.code === 'Space' || e.code === 'Tab') {
        e.preventDefault();
        if (state === 'speaking') {
          stopAudio(isLive); // Skip state update if live, as we'll set it to listening
          if (isLive) {
            startRecording();
            setState('listening');
          }
        } else {
          toggleMic();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLive, state]);

  return (
    <div className="cerevyn-container">
      {/* Background Atmosphere */}
      <div className={`aura-layer ${state !== 'idle' ? 'active' : ''}`} />

      {/* Top Bar */}
      <header className="top-bar">
        <div className="branding">
          <div className="status-indicator">
            <span className={`status-dot ${state !== 'idle' ? 'active' : ''}`} />
            <span>{state.charAt(0).toUpperCase() + state.slice(1)}</span>
          </div>
          <h1 className="brand-text">Cerevyn Live</h1>
        </div>
        <div className="actions">
          <button className="secondary-btn" onClick={() => setShowSettings(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main AI Stage */}
      <main className="voice-stage">
        <div className="orb-container">
          <div className={`orb ${state}`} />
          <div className="orb-status-text">
            {state === 'idle' ? 'Start' : state}
          </div>
        </div>

        {/* Minimal Chat Overlay */}
        <div className="chat-window" ref={chatWindowRef}>
          {history.length > 0 && history.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Control Center */}
      <footer className="bottom-controls">
        <div className="main-action">
          {state !== 'speaking' && (
            <button
              className={`mic-toggle ${isLive ? 'active' : ''}`}
              onClick={toggleMic}
            >
              {isLive ? <MicOff size={28} /> : <Mic size={28} />}
            </button>
          )}

          {state === 'speaking' && (
            <button className="secondary-btn stop-ai-btn active" onClick={stopAudio} title="Stop AI">
              <Square size={28} fill="currentColor" />
            </button>
          )}
        </div>
      </footer>

      {/* Settings Modal (Responsive Card) */}
      {showSettings && (
        <div className="settings-modal" onClick={() => setShowSettings(false)}>
          <div className="settings-card" onClick={e => e.stopPropagation()}>
            <div className="settings-section">
              <h3>Vocal Persona</h3>
              <div className="grid-settings">
                <div className="option-group">
                  <label>Engine</label>
                  <CustomSelect
                    value={settings.engine}
                    onChange={v => {
                      settings.setEngine(v);
                      const firstVoice = TTS_DATA[v]?.[settings.gender]?.[0] || '';
                      settings.setVoice(firstVoice);
                    }}
                    options={{
                      orpheus: "Groq Orpheus (English)",
                      ai4bharat: "Meta MMS (Multilingual)",
                      gtts: "Google TTS (Standard)"
                    }}
                  />
                </div>
                <div className="option-group">
                  <label>Gender</label>
                  <CustomSelect
                    value={settings.gender}
                    onChange={v => {
                      settings.setGender(v);
                      const firstVoice = TTS_DATA[settings.engine]?.[v]?.[0] || '';
                      settings.setVoice(firstVoice);
                    }}
                    options={["female", "male"]}
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Voice & Accent</h3>
              <div className="grid-settings">
                <div className="option-group">
                  <label>Voice</label>
                  <CustomSelect
                    value={settings.voice}
                    onChange={v => settings.setVoice(v)}
                    options={TTS_DATA[settings.engine]?.[settings.gender] || []}
                  />
                </div>
                <div className="option-group">
                  <label>Accent & Region</label>
                  <CustomSelect
                    value={settings.accent}
                    onChange={v => settings.setAccent(v)}
                    options={{
                      'en-US': "English (US)",
                      'en-IN': "English (India)",
                      'hi-IN': "Hindi (India)",
                      'te-IN': "Telugu (India)",
                      'ta-IN': "Tamil (India)",
                      'kn-IN': "Kannada (India)"
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Expression</h3>
              <div className="grid-settings">
                <div className="option-group">
                  <label>Tone</label>
                  <CustomSelect
                    value={settings.tone}
                    onChange={v => settings.setTone(v)}
                    options={["professional", "friendly", "creative", "concise"]}
                  />
                </div>
                <div className="option-group">
                  <label>Speed ({settings.speed}x)</label>
                  <input
                    type="range" min="0.5" max="2.0" step="0.1"
                    value={settings.speed}
                    onChange={e => settings.setSpeed(parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </div>


            <button className="secondary-btn" style={{ width: '100%', marginTop: '1rem', background: '#fff', color: '#000' }} onClick={() => setShowSettings(false)}>
              Back to Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
