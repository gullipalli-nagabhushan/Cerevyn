import os
import time
import tempfile
import asyncio
from fastapi import FastAPI, UploadFile, File, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from stt import STT
from llm import LLM
from tts import TTS
import io

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        transcript, language, duration = stt_base.transcribe(audio_path)
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
    
    print(f"TTS Request: engine={engine}, gender={gender}, voice={voice}, accent={accent}, text='{text[:30]}...'")
    audio_data, type, used_accent = tts_service.generate_audio(text, accent, voice, speed, pitch, tone, engine, gender)
    
    if type == "file":
        return FileResponse(audio_data, media_type="audio/mpeg", headers={"X-Used-Accent": used_accent})
    else:
        # Binary data from Groq (WAV)
        return Response(content=audio_data, media_type="audio/wav", headers={"X-Used-Accent": used_accent})

@app.get("/api/chat-history")
async def get_history():
    return llm_service.history

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
