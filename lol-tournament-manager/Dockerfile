# ──────────────────────────────────────────────────────────────
# Stage 1: Build React frontend
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund

COPY frontend/ ./
RUN npm run build -- --outDir /app/static


# ──────────────────────────────────────────────────────────────
# Stage 2: Python runtime
# ──────────────────────────────────────────────────────────────
FROM python:3.11-slim

LABEL maintainer="LoL Tournament Manager"
LABEL description="Internal League of Legends Tournament Manager"

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir \
    fastapi>=0.110.0 \
    uvicorn[standard]>=0.29.0 \
    httpx>=0.25.0

# Copy backend source
COPY *.py ./

# Copy pre-built frontend from stage 1
COPY --from=frontend-build /app/static ./static

# Data volume: the SQLite database lives here so it persists across restarts
VOLUME /app/data

# Override DB_PATH at runtime so data is stored in the volume
ENV DB_PATH=/app/data/tournament.db
ENV PYTHONUNBUFFERED=1

# Expose the API port
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/players?active_only=true')" || exit 1

# Run with uvicorn
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
