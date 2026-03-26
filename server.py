import os
import sys
import time
import tempfile
import asyncio

from fastapi import FastAPI, UploadFile, File, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from stt import STT
from llm import LLM
from tts import TTS
import io

load_dotenv()
app = FastAPI()

# CORS Configuration
# Allowed: Production Vercel URL and Local Development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://cerevyn-bot.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Used-Accent"],
)

# Services
llm_service = LLM()
tts_service = TTS()
stt_base = STT() # Now using Groq Cloud API

@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
        tmp.write(await audio.read())
        audio_path = tmp.name
    
    try:
        # Detect language and transcribe
        print(f"--- Transcribing audio from {audio_path} ---")
        transcript, language, duration = stt_base.transcribe(audio_path)
        print(f"--- STT Result: [{language}] '{transcript}' (in {duration}ms) ---")
        return {"transcript": transcript, "language": language, "confidence": 1.0}
    finally:
        if os.path.exists(audio_path): os.remove(audio_path)

@app.post("/api/chat")
async def chat(request: Request):
    data = await request.json()
    transcript = data.get("transcript")
    accent = data.get("accent", "en-US")
    tone = data.get("tone", "professional")
    history = data.get("history", [])
    model_type = data.get("model", "groq")
    
    # detected language should be passed or detected during transcribe
    lang = accent.split("-")[0]
    
    # Use a streaming response for the text to make it feel instant
    async def generate_chunks():
        full_response = ""
        for chunk, _ in llm_service.get_response(transcript, tone, lang):
            full_response += chunk
            yield chunk
        # Add to history at the end
        # llm_service.add_to_history("assistant", full_response) # Handled in LLM.get_response already

    return StreamingResponse(generate_chunks(), media_type="text/plain")

@app.post("/api/speak")
async def speak(request: Request):
    data = await request.json()
    text = data.get("text")
    accent = data.get("accent", "en-US")
    voice = data.get("voice", "hannah")
    speed = float(data.get("speed", 1.0))
    pitch = float(data.get("pitch", 1.0))
    tone = data.get("tone", "professional")
    engine = data.get("engine", "orpheus")
    gender = data.get("gender", "female")
    
    # Safe print for non-ASCII text on various terminals
    safe_text = text[:30].encode('ascii', 'ignore').decode('ascii')
    print(f"TTS Request: engine={engine}, gender={gender}, voice={voice}, accent={accent}, text='{safe_text}...'")
    audio_data, type, used_accent = tts_service.generate_audio(text, accent, voice, speed, pitch, tone, engine, gender)
    
    if type == "file":
        return FileResponse(audio_data, media_type="audio/mpeg", headers={"X-Used-Accent": used_accent})
    else:
        # Binary data from Groq (WAV)
        return Response(content=audio_data, media_type="audio/wav", headers={"X-Used-Accent": used_accent})

@app.get("/api/chat-history")
async def get_history():
    return llm_service.history

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}

@app.get("/")
async def root():
    return {"message": "Cerevyn Voice API is running"}

# Serve static files from the 'dist' directory (after npm run build)
# Mounted at the end so it doesn't intercept API routes
if os.path.exists("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
