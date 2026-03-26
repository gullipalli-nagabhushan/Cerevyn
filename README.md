# 🎙️ Cerevyn: Real-Time Polyglot Voice Chatbot

Cerevyn is a cutting-edge, low-latency voice-to-voice chatbot built with **FastAPI** (Backend) and **React/Vite** (Frontend). It leverages **Groq Cloud** for lightning-fast speech-to-text (Whisper) and LLM streaming (Llama 3), with a versatile TTS engine supporting both global and Indic languages via **gTTS** and **Meta MMS**.

## 🚀 Features
- **Real-time Pipeline**: Achieves sub-3s end-to-end latency by overlapping STT, LLM, and TTS stages.
- **Polyglot Support**: Auto-detects and synthesizes speech in major Indic languages (Telugu, Hindi, Kannada, etc.) and English.
- **Streaming Responses**: Text generates and streams to the UI instantly for a more natural conversation.
- **Modern UI**: Polished, glassmorphic React interface with real-time status indicators and voice activity detection (VAD).
- **Flexible TTS**: Uses Groq's Orpheus for English and Meta MMS (via Hugging Face) for Indic voices.

## 🛠️ Tech Stack
- **Backend**: FastAPI, Uvicorn, Python 3.10+
- **Frontend**: React 19, Vite, Tailwind CSS (Vanilla CSS)
- **STT**: Groq Cloud (Whisper-large-v3)
- **LLM**: Groq Cloud (Llama-3.1-8b-instant)
- **TTS**: gTTS, Meta MMS (Hugging Face Inference API), Groq Orpheus
- **VAD**: webrtcvad

## 📦 Installation

### Prerequisites
- Python 3.10+
- Node.js & npm (for frontend building)
- **ffmpeg** (Required for audio processing)

### Setup
1. **Clone the repository** and navigate to the root directory.
### 1. Backend Setup (FastAPI)
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
pip install -r requirements.txt
python server.py
```

### 2. Frontend Setup (React/Vite)
```bash
cd frontend
npm install
npm run dev
```

---

## 🚀 Running the App (Root Proxy)
You can also run these common commands from the root directory using the proxy `package.json`:

- **Install Frontend**: `npm run install:frontend`
- **Run Frontend**: `npm run dev:frontend`
- **Run Backend**: `npm run dev:backend`
- **Build Frontend**: `npm run build:frontend`

4. **Environment Configuration**:
   Create a `.env` file in the root with:
   ```env
   GROQ_API_KEY=your_groq_api_key
   HF_API_KEY=your_hugging_face_api_key
   ```

## 🏃 Running the Application

### Local Development
1. **Start the Backend**:
   ```bash
   python server.py
   ```
2. **Run Frontend (from the root)**:
   ```bash
   npm run dev
   ```
   *Note: This proxies the command to the `frontend` directory using the root-level `package.json`.*

### Docker
The project includes a multi-stage Dockerfile for easy deployment:
```bash
docker build -t cerevyn-chatbot .
docker run -p 8000:8000 --env-file .env cerevyn-chatbot
```

## Project Structure

```text
Cerevyn/
├── backend/                # FastAPI Backend Service
│   ├── server.py           # API Orchestration
│   ├── stt.py              # Groq Whisper STT
│   ├── llm.py              # Groq Llama3 LLM
│   ├── tts.py              # Meta MMS & gTTS
│   ├── requirements.txt    # Python Dependencies
│   ├── Dockerfile          # Production Build
│   └── railway.json        # Railway Config
├── frontend/               # React (Vite) Frontend
│   ├── src/                # Source Code
│   ├── package.json        # Node Dependencies
│   └── vercel.json         # Vercel Config
├── README.md               # Project Documentation
└── package.json            # Root proxy for npm commands
```
