from groq import Groq
import os
import time

class STT:
    def __init__(self):
        self.groq_key = os.environ.get("GROQ_API_KEY")
        self.client = Groq(api_key=self.groq_key) if self.groq_key else None

    def transcribe(self, audio_path):
        """Transcribes audio file using Groq Cloud API and returns text + language + duration in ms."""
        if not self.client:
            return "Groq API Key not found", "en", 0
            
        start_time = time.time()
        try:
            with open(audio_path, "rb") as file:
                transcription = self.client.audio.transcriptions.create(
                    file=(os.path.basename(audio_path), file.read()),
                    model="whisper-large-v3-turbo",
                    response_format="verbose_json",
                    prompt="The user is talking to Cerevyn, a helpful AI assistant. Ignore background noise and keyboard clicks."
                )
            duration_ms = int((time.time() - start_time) * 1000)
            transcript = transcription.text.strip()
            language = getattr(transcription, 'language', 'en')
            print(f"STT: [{language}] {transcript} ({duration_ms}ms)")
            return transcript, language, duration_ms
        except Exception as e:
            if "too short" in str(e).lower():
                print(f"STT: Audio too short, returning empty.")
                return "", "en", 0
            raise e
