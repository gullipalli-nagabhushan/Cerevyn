import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Mic, MicOff, RotateCcw, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './App.css';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  const chunksRef = useRef([]);

  const startRecording = async () => {
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // VAD Logic
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
      
      if (volume > 5) { // Threshold for "talking"
        silenceStart = Date.now();
      } else if (Date.now() - silenceStart > 1500) { // 1.5s silence
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
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      onStop(blob);
      audioContext.close();
    };
    mediaRecorderRef.current.start();
    requestAnimationFrame(checkSilence);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  return { startRecording, stopRecording };
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
  const activeAudioRef = useRef(null);
  const isLiveRef = useRef(false); // For use in async closures

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const stopAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
      audioResultsRef.current = {}; 
      nextToPlayRef.current = 0;
      isPlayingQueueRef.current = false;
      if (state === 'speaking') setState('idle');
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
    stopAudio(); // Stop any previous speech
    nextToPlayRef.current = 0; // Reset queue index for new turn
    audioResultsRef.current = {}; // Clear any stale audio
    setState('processing');
    try {
      // 1. Transcribe
      const form = new FormData();
      form.append('audio', blob, 'recording.webm');
      const transcribeRes = await fetch(`${BASE_URL}/api/transcribe`, { method: 'POST', body: form });
      const { transcript, language } = await transcribeRes.json();
      setLiveTranscript(transcript);
      addTurn('user', transcript);

      // 2. Chat & Speak Pipeline
      const chatRes = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcript, 
          accent: settings.accent, 
          tone: settings.tone, 
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
      const speakRes = await fetch(`${BASE_URL}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      
      const usedAccent = speakRes.headers.get('X-Used-Accent');
      if (usedAccent && usedAccent !== settings.accent) {
        settings.setAccent(usedAccent);
      }

      const audioBlob = await speakRes.blob();
      audioResultsRef.current[index] = audioBlob;
      processQueue();
    } catch (e) { console.error("Speech Trigger Error:", e); }
  };

  const { startRecording, stopRecording } = useMediaRecorder(handleAudioBlob);

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
      stopAudio();
      setState('idle');
    } else {
      setIsLive(true);
      isLiveRef.current = true;
      stopAudio();
      startRecording();
      setState('listening');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && state === 'idle') {
        e.preventDefault();
        toggleMic();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state]);

  return (
    <div className="cerevyn-container">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="branding">
          <img src="/cerevyn-icon.png" alt="Cerevyn Logo" className="brand-logo" />
          <span>Cerevyn</span>
        </div>
        <div className="actions">
          <div className={`status-badge ${state}`}>
            {state.toUpperCase()}
          </div>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="voice-stage">
        <div className={`orb ${state}`}></div>
        
        <div className="wave-bars">
          {[...Array(7)].map((_, i) => (
            <div key={i} className={`wave-bar ${state}`} style={{ animationDelay: `${i * 0.1}s` }}></div>
          ))}
        </div>

        <div className="live-transcript">
          {liveTranscript || (state === 'listening' ? 'Listening...' : '')}
        </div>
      </div>

      {/* Transcript Area */}
      <div className="chat-area">
        {history.map((msg, idx) => (
          <div key={idx} className={`chat-bubble ${msg.role}`}>
            {msg.role === 'assistant' && <div className="avatar-dot"></div>}
            <div className="bubble-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Bottom Bar */}
      <div className="bottom-bar">
        <div className="bar-actions">
           {state === 'speaking' && (
             <button className="stop-btn" onClick={stopAudio}>Stop Speaking</button>
           )}
           <button className="text-btn" onClick={clear}>Clear</button>
        </div>
        
        <button className={`main-mic-btn ${state}`} onClick={toggleMic}>
          {state === 'listening' ? <MicOff size={32} /> : <Mic size={32} />}
        </button>

        <button className="text-btn" onClick={() => {
          setLiveTranscript("Demo: How is the weather?");
          handleAudioBlob(new Blob()); // Dummy blob for demo
        }}>Demo</button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <h3>Assistant Settings</h3>
            <button className="close-btn" onClick={() => setShowSettings(false)}>×</button>
          </div>
          
          <div className="setting-item">
            <label>TTS Engine</label>
            <select value={settings.engine} onChange={e => settings.setEngine(e.target.value)}>
              {Object.keys(TTS_DATA).map(e => (
                <option key={e} value={e}>{TTS_DATA[e].name}</option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label>Gender</label>
            <select value={settings.gender} onChange={e => {
              settings.setGender(e.target.value);
              // Auto-pick first voice for new gender
              settings.setVoice(TTS_DATA[settings.engine][e.target.value][0]);
            }}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Voice Persona</label>
            <select value={settings.voice} onChange={e => settings.setVoice(e.target.value)}>
              {TTS_DATA[settings.engine][settings.gender].map(v => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label>Voice Accent</label>
            <select value={settings.accent} onChange={e => settings.setAccent(e.target.value)}>
              <option value="en-US">English (US)</option>
              <option value="en-IN">English (India)</option>
              <option value="te-IN">Telugu (India)</option>
              <option value="kn-IN">Kannada (India)</option>
              <option value="bn-IN">Bengali (India)</option>
              <option value="ta-IN">Tamil (India)</option>
              <option value="or-IN">Odia (India)</option>
              <option value="hi-IN">Hindi (India)</option>
              <option value="es-ES">Spanish (Spain)</option>
              <option value="fr-FR">French (France)</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Tone</label>
            <select value={settings.tone} onChange={e => settings.setTone(e.target.value)}>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="friendly">Friendly</option>
              <option value="excited">Excited</option>
              <option value="whisper">Whisper</option>
              <option value="concise">Concise</option>
            </select>
          </div>

          <div className="setting-item">
            <label>Speed: {settings.speed}x</label>
            <input type="range" min="0.5" max="2.0" step="0.1" value={settings.speed} onChange={e => settings.setSpeed(e.target.value)} />
          </div>

          <div className="setting-item">
            <label>Pitch: {settings.pitch}</label>
            <input type="range" min="0.5" max="2.0" step="0.1" value={settings.pitch} onChange={e => settings.setPitch(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
