# ---------- 1) Compila o site (React/Vite) ----------
FROM node:20-alpine AS site
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- 2) API (FastAPI) servindo também o site compilado ----------
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=America/Sao_Paulo
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/app backend/app
COPY backend/scripts backend/scripts
# O backend procura o site em <raiz>/frontend/dist
COPY --from=site /src/frontend/dist frontend/dist

# Banco e fotos ficam fora da imagem (volume em /app/backend/data)
RUN mkdir -p backend/data && chmod 777 backend/data
WORKDIR /app/backend
EXPOSE 8010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8010/api/saude', timeout=4)"

# 1 worker só: os agendadores do Mercado Livre e do OneDrive rodam dentro do processo
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010", "--workers", "1"]
