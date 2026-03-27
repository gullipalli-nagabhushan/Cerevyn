import os
import sys
import time
import tempfile
import asyncio

from fastapi import FastAPI, UploadFile, File, Form, Request, Response, HTTPException, Header, Depends, Security
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from stt import STT
from llm import LLM
from tts import TTS
import io

load_dotenv()
app = FastAPI()

# Compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

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
    allow_methods=["GET", "POST"], # Restricted
    allow_headers=["*"],
    expose_headers=["X-Used-Accent"],
)

# API Key Configuration
API_SECURITY_KEY = os.environ.get("API_SECURITY_KEY", "dev-key-123")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def get_api_key(api_key: str = Security(api_key_header)):
    if api_key != API_SECURITY_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid API Key")
    return api_key

# Security Headers Middleware (Headers only)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Relaxed CSP for Swagger UI / Docs support
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "img-src 'self' data: https://fastapi.tiangolo.com; "
        "frame-ancestors 'none';"
    )
    return response

# Services
llm_service = LLM()
tts_service = TTS()
stt_base = STT() # Now using Groq Cloud API

@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...), token: str = Depends(get_api_key)):
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
async def chat(request: Request, token: str = Depends(get_api_key)):
    data = await request.json()
    # Support both 'prompt' (new) and 'transcript' (old) keys
    transcript = data.get("prompt") or data.get("transcript")
    if not transcript:
        raise HTTPException(status_code=400, detail="Missing prompt or transcript")

    accent = data.get("language") or data.get("accent", "en-US")
    tone = data.get("tone", "professional")
    history = data.get("history", [])
    model_type = data.get("model", "groq")
    
    # Extract language code (e.g., 'en' from 'en-US')
    lang = accent.split("-")[0] if "-" in accent else accent
    
    # Use a streaming response for the text to make it feel instant
    # Use the history passed from the frontend for session isolation
    async def generate_chunks():
        full_response = ""
        # Pass history to ensure context is maintained per-user
        for chunk, _ in llm_service.get_response(transcript, tone, lang, history=history):
            full_response += chunk
            yield chunk
        # Add to history at the end
        # Handled in LLM.get_response already

    return StreamingResponse(generate_chunks(), media_type="text/plain")

@app.post("/api/speak")
async def speak(request: Request, token: str = Depends(get_api_key)):
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
async def get_history(token: str = Depends(get_api_key)):
    return llm_service.history

@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": time.time()}

@app.get("/")
async def root():
    return {"message": "Cerevyn Voice API is running"}


if __name__ == '__main__':
    import uvicorn
    # Use PORT from environment or default to 8000
    port = int(os.environ.get("PORT", 8000))
    # Enable reload only for local development
    is_dev = os.environ.get("RAILWAY_ENVIRONMENT_NAME") is None
    print(f"Starting server on port {port} (Reload: {is_dev})...")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=is_dev)
