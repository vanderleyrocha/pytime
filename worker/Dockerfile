# Contexto de build = raiz do repositório (precisa enxergar engine/).
# Ex.: fly deploy --remote-only  (da raiz, usa o fly.toml da raiz)
FROM python:3.12-slim

WORKDIR /srv
COPY engine/ ./engine/
COPY worker/ ./worker/
RUN pip install --no-cache-dir ./engine ./worker

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "pytime_worker.principal"]
