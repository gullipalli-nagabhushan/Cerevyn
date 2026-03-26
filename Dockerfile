# Backend Dockerfile for Railway (Separate Service)
FROM python:3.10-slim

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files (respecting .dockerignore)
COPY . .

# Railway provides the PORT environment variable
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
