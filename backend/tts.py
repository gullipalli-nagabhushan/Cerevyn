import os
import time
import tempfile
from gtts import gTTS
from groq import Groq

class TTS:
    def __init__(self):
        self.groq_key = os.environ.get("GROQ_API_KEY")
        self.hf_key = os.environ.get("HF_API_KEY") # For Meta MMS Indic-TTS
        self.client = Groq(api_key=self.groq_key) if self.groq_key else None
        self.cache = {} # Simple in-memory cache: (text, engine, voice, speed) -> content
        self.max_cache_size = 50
        
        # Mapping for Meta MMS (Massively Multilingual Speech) models on HF
        # These are much better supported for serverless inference than AI4Bharat
        self.indic_models = {
            "te-IN": "facebook/mms-tts-tel",
            "hi-IN": "facebook/mms-tts-hin",
            "kn-IN": "facebook/mms-tts-kan",
            "bn-IN": "facebook/mms-tts-ben",
            "ta-IN": "facebook/mms-tts-tam",
            "mr-IN": "facebook/mms-tts-mar",
            "gu-IN": "facebook/mms-tts-guj",
            "pa-IN": "facebook/mms-tts-pan",
        }

    def generate_audio(self, text, accent="en-US", voice="hannah", speed=1.0, pitch=1.0, tone="professional", engine="orpheus", gender="female"):
        """Generates audio and returns (content/path, type, used_accent)."""
        
        # Security & Validation
        text = text.strip()[:1000] # Max 1000 chars for safety
        if not text: return None, "binary", accent
        
        # Cache Check (Only for binary results)
        cache_key = (text, engine, voice, speed, accent)
        if cache_key in self.cache:
            print(f"TTS Cache Hit: '{text[:20]}...'")
            return self.cache[cache_key], "binary", accent

        # 0. Quick detection for Auto-Accent
        # Telugu check
        if any('\u0c00' <= c <= '\u0c7f' for c in text): accent = "te-IN"
        elif any('\u0900' <= c <= '\u097f' for c in text): accent = "hi-IN"
        elif any('\u0c80' <= c <= '\u0cff' for c in text): accent = "kn-IN"
        elif any('\u0980' <= c <= '\u09ff' for c in text): accent = "bn-IN"
        elif any('\u0b80' <= c <= '\u0bff' for c in text): accent = "ta-IN"
        elif any('\u0b00' <= c <= '\u0b7f' for c in text): accent = "or-IN"

        is_pure_english = all(ord(c) < 128 or c in "*.,!?;:'\"- " for c in text[:200])

        # 1. Try Groq Orpheus (Requested or English Auto)
        if (engine == "orpheus" or (engine == "auto" and is_pure_english)) and self.client:
            if is_pure_english:
                try:
                    response = self.client.audio.speech.create(
                        model="canopylabs/orpheus-v1-english",
                        input=text.replace("*", ""),
                        voice=voice.lower(), # hannah, diana, autumn, austin, daniel, troy
                        response_format="wav",
                        speed=speed,
                    )
                    
                    if hasattr(response, 'content'): content = response.content
                    elif hasattr(response, 'read'): content = response.read()
                    else: content = b"".join([chunk for chunk in response.iter_bytes()])
                    
                    self._save_to_cache(cache_key, content)
                    return content, "binary", accent
                except Exception as e:
                    print(f"Groq TTS failed: {e}. Falling back...")
            else:
                print("Orpheus requested but text is not English. Falling back...")

        # 2. Try Meta MMS Indic-TTS via Hugging Face
        if (engine == "ai4bharat" or (engine == "auto" and not is_pure_english)) and accent in self.indic_models:
            if not self.hf_key:
                print("Indic-TTS requested but HF_API_KEY is missing in .env. Falling back to gTTS.")
            else:
                try:
                    import requests
                    use_gender = gender if gender in ["male", "female"] else ("male" if voice.lower() in ["austin", "daniel", "troy"] else "female")
                    model_id = self.indic_models[accent]
                    
                    # CORRECT HF ROUTER ENDPOINT (Serverless Inference)
                    api_url = f"https://api-inference.huggingface.co/models/{model_id}"
                    headers = {"Authorization": f"Bearer {self.hf_key}"}
                    
                    # Try with a small timeout and potentially one retry for cold starts
                    for attempt in range(2):
                        response = requests.post(api_url, headers=headers, json={"inputs": text.replace("*", "")}, timeout=15)
                        
                        if response.status_code == 200:
                            if b"error" in response.content[:100] and b"loading" in response.content:
                                print(f"Indic-TTS Model {model_id} is loading. Attempt {attempt+1}...")
                                time.sleep(5)
                                continue
                            print(f"SUCCESS: Generated audio with AI4Bharat Indic-TTS ({accent}, {use_gender})")
                            self._save_to_cache(cache_key, response.content)
                            return response.content, "binary", accent
                        elif response.status_code == 503:
                            print(f"Indic-TTS Model {model_id} is loading (503). Retrying in 5s...")
                            time.sleep(5)
                        else:
                            # Safe print for response text
                            safe_err = response.text.encode('ascii', 'ignore').decode('ascii')
                            print(f"Indic-TTS API failed ({response.status_code}): {safe_err}")
                            break # Don't retry on 400s/401s
                except Exception as e:
                    print(f"Indic-TTS Integration Error: {e}")

        # 3. Final Fallback (gTTS)
        lang = accent.split("-")[0]
        tts = gTTS(text=text.replace("*", ""), lang=lang)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as fp:
            tts.save(fp.name)
            temp_path = fp.name
            
        # Apply Post-Processing (Speed, Pitch, Whisper)
        if speed != 1.0 or pitch != 1.0 or tone.lower() == "whisper":
            try:
                from pydub import AudioSegment
                audio = AudioSegment.from_mp3(temp_path)
                if tone.lower() == "whisper": audio = audio.low_pass_filter(2000).apply_gain(-20) 
                if pitch != 1.0:
                    new_sample_rate = int(audio.frame_rate * pitch)
                    audio = audio._spawn(audio.raw_data, overrides={'frame_rate': new_sample_rate})
                    audio = audio.set_frame_rate(audio.frame_rate)
                if speed != 1.0: audio = audio.speedup(playback_speed=speed)
                with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as out:
                    audio.export(out.name, format="mp3")
                    os.remove(temp_path)
                    return out.name, "file", accent
            except Exception as e:
                print(f"Pydub processing failed: {e}")
                
        return temp_path, "file", accent

    def _save_to_cache(self, key, content):
        if len(self.cache) >= self.max_cache_size:
            self.cache.pop(next(iter(self.cache))) # Simple FIFO eviction
        self.cache[key] = content

