# Backend Dockerfile for Railway (Separate Service)
FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy all files from the backend directory to the container
# (Requires build context to be set to the backend/ folder)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy logic
COPY . .

# Use python -m uvicorn for better reliability
CMD python -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
