# Contexto de build = raiz do repositório (precisa enxergar engine/).
# Ex.: fly deploy --config worker/fly.toml --remote-only  (da raiz)
FROM python:3.12-slim

WORKDIR /srv
COPY engine/ ./engine/
COPY worker/ ./worker/
RUN pip install --no-cache-dir ./engine ./worker

ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "pytime_worker.principal"]
