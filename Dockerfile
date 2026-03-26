# Backend Dockerfile for Railway (Separate Service)
FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files
COPY . .

# Use python -m uvicorn for better reliability
CMD python -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
