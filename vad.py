import collections
try:
    import webrtcvad
    WEBRTC_AVAILABLE = True
except ImportError:
    WEBRTC_AVAILABLE = False
    print("WARNING: webrtcvad not found. Local mic VAD will be disabled.")

class VoiceActivityDetector:
    def __init__(self, aggressiveness=2, sample_rate=16000, frame_duration_ms=30):
        if WEBRTC_AVAILABLE:
            self.vad = webrtcvad.Vad(aggressiveness)
        else:
            self.vad = None
        self.sample_rate = sample_rate
        self.frame_duration_ms = frame_duration_ms
        self.frame_size = int(sample_rate * frame_duration_ms / 1000)

    def is_speech(self, frame):
        """Returns True if the frame contains speech."""
        if self.vad:
            return self.vad.is_speech(frame, self.sample_rate)
        return True # Default to True if VAD is missing

    def collector(self, audio_frames, padding_ms=300):
        """
        Yields chunks of audio that are detected as speech.
        audio_frames: A generator/iterator of audio frames (bytes).
        padding_ms: Number of milliseconds of silence to wait before ending a segment.
        """
        num_padding_frames = int(padding_ms / self.frame_duration_ms)
        ring_buffer = collections.deque(maxlen=num_padding_frames)
        triggered = False
        voiced_frames = []

        for frame in audio_frames:
            if not triggered:
                ring_buffer.append((frame, self.is_speech(frame)))
                num_voiced = len([f for f, speech in ring_buffer if speech])
                if num_voiced > 0.9 * ring_buffer.maxlen:
                    triggered = True
                    voiced_frames.extend([f for f, s in ring_buffer])
                    ring_buffer.clear()
            else:
                voiced_frames.append(frame)
                ring_buffer.append((frame, self.is_speech(frame)))
                num_unvoiced = len([f for f, speech in ring_buffer if not speech])
                if num_unvoiced > 0.9 * ring_buffer.maxlen:
                    triggered = False
                    yield b''.join(voiced_frames)
                    voiced_frames = []
                    ring_buffer.clear()
        
        if voiced_frames:
            yield b''.join(voiced_frames)

def frame_generator(audio_bytes, frame_duration_ms=30, sample_rate=16000):
    """Generates audio frames from a byte string."""
    n = int(sample_rate * (frame_duration_ms / 1000.0) * 2) # 2 bytes per sample (16-bit PCM)
    offset = 0
    while offset + n <= len(audio_bytes):
        yield audio_bytes[offset:offset + n]
        offset += n
