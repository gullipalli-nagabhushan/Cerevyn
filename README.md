# 🎙️ Voice Chatbot with Whisper & Groq

A real-time voice-to-voice chatbot built with Python, using **OpenAI Whisper** for speech-to-text, **Groq API (Llama 3)** for low-latency LLM streaming, and **pyttsx3** for offline text-to-speech.

## 🚀 Features
- **Real-time Pipeline**: Overlaps STT, LLM streaming, and TTS for sub-3s latency.
- **Streaming Responses**: Starts speaking as soon as the first sentence is ready.
- **Gradio UI**: Clean web interface for mic interaction and audio file uploads.
- **Robust Fallbacks**: 
  - LLM: Falls back to local **Ollama** if Groq API fails.
  - TTS: Falls back to **gTTS** if local drivers are missing.
- **Performance Tracking**: Prints stage-by-stage timing (STT, LLM, TTS) for benchmarking.

## 🛠️ Tech Stack
- **STT**: `openai-whisper` (base)
- **LLM**: `Groq API` (Llama3-8b-8192)
- **TTS**: `pyttsx3` (Offline) & `gTTS` (Online/Fallback)
- **UI**: `Gradio`
- **Audio**: `sounddevice`, `scipy`, `pydub`, `webrtcvad`

## 📦 Installation

1. **Clone or Download** the `voice_chatbot` folder.
2. **Setup virtual environment**:
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # Mac/Linux
   source venv/bin/activate
   ```
3. **Install ffmpeg** (Required for Whisper):
   - Windows: `choco install ffmpeg` or download binaries.
   - Mac: `brew install ffmpeg`
   - Linux: `sudo apt install ffmpeg`
4. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
5. **Configure API Key**:
   Create a file named `.env` (already provided in the folder) and add your Groq API key:
   ```text
   GROQ_API_KEY=your_key_here
   ```

## 🏃 Running the App

```bash
python app.py
```
Wait for the Whisper model to load, then open the Gradio link (usually `http://127.0.0.1:7860`) in your browser.

## 📁 File Structure
- `app.py`: Main Gradio application.
- `stt.py`: Transcription logic.
- `llm.py`: Llama 3 & Ollama integration.
- `tts.py`: Audio feedback logic.
- `vad.py`: Voice Activity Detection.
- `requirements.txt`: Project dependencies.
