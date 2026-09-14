# Outskirts Perception Service Container (Section 7.2)
# Sovereign Python service hosting RF-DETR symbol detection, SAHI tiling, and GraphRAG.
# Bound to internal backplane network (no egress).

FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy perception service code
COPY . .

EXPOSE 8002

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8002/health')" || exit 1

CMD ["uvicorn", "main.py:app", "--host", "0.0.0.0", "--port", "8002"]
