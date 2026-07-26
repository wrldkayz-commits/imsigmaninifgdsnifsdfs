# Single-image build: compile the frontend, then serve it from the API process.
#
# Useful for Fly.io, Railway, Cloud Run, or any VPS with Docker. Render can use
# this too, but `render.yaml` is simpler there.

# --- stage 1: build the frontend ------------------------------------------------
FROM node:20-alpine AS frontend

WORKDIR /build

# Copy manifests first so `npm ci` is cached independently of source changes.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install

COPY frontend/ ./
RUN npm run build


# --- stage 2: runtime -----------------------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    GUIFORGE_FRONTEND_DIST=/app/frontend/dist

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend /build/dist ./frontend/dist

# Run as a non-root user — nothing here needs elevated privileges.
RUN useradd --create-home --uid 1001 guiforge && chown -R guiforge:guiforge /app
USER guiforge

WORKDIR /app/backend

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
