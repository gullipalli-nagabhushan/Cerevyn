import os
import requests
import json
import time
from dotenv import load_dotenv
from groq import Groq

# Load environment variables at module level
load_dotenv()

class LLM:
    def __init__(self):
        self.groq_key = os.environ.get("GROQ_API_KEY")
        
        if self.groq_key:
            self.groq_client = Groq(api_key=self.groq_key)
        else:
            self.groq_client = None
            
        self.history = []
        self.max_history = 6

    def add_to_history(self, role, content):
        self.history.append({"role": role, "content": content})
        if len(self.history) > self.max_history * 2:
            self.history = self.history[-self.max_history * 2:]

    def get_response(self, prompt, tone="professional", language="en"):
        # Tone-specific instructions
        tone_instructions = {
            "friendly": "Speak with a warm, energetic, and helpful personality. Use casual but polite language.",
            "professional": "Maintain a polished, authoritative yet helpful demeanor. Use formal and clear language.",
            "concise": "Be extremely brief and direct. Provide the answer in as few words as possible while remaining helpful.",
            "whisper": "Speak softly and intimately. Use shorter sentences. (Note: Audio will be processed to sound like a whisper).",
            "excited": "Speak with high energy and enthusiasm. Use expressive words!",
        }
        instruction = tone_instructions.get(tone.lower(), "Be helpful and natural.")

        system_prompt = (
            f"You are Cerevyn, a cutting-edge Real-Time Voice Chatbot. "
            f"Your current persona is: {tone.upper()}. {instruction} "
            f"Always respond in {language}. Keep responses optimized for spoken conversation. "
            "Avoid complex markdown. Focus on being natural, responsive, and context-aware."
        )
        self.add_to_history("user", prompt)
        
        try:
            if self.groq_client:
                # Groq logic
                messages = [{"role": "system", "content": system_prompt}] + self.history
                completion = self.groq_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=messages,
                    stream=True
                )
                
                full_response = ""
                for chunk in completion:
                    content = chunk.choices[0].delta.content
                    if content:
                        full_response += content
                        yield content, 0
                
                self.add_to_history("assistant", full_response)
            else:
                yield "I'm sorry, Groq client is not configured.", 0

        except Exception as e:
            print(f"LLM Error: {e}")
            yield f"Error: {str(e)}", 0
