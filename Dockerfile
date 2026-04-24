# ── Stage 1: Build Frontend ──
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Build Backend ──
FROM python:3.12-slim
WORKDIR /app

# Install dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy frontend build output to a place the backend can serve
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure data directory exists
RUN mkdir -p /app/data/uploads /app/data/embeddings

# Copy dimensions.json if it's meant to be in a specific place
# (It's already inside backend/knowledge_base/dimensions.json so this is covered by COPY backend/)

# Expose port
EXPOSE 8000

# Start server — Cloud Run sets PORT env var, default to 8000 for local
WORKDIR /app/backend
CMD python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
