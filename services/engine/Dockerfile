# Image du moteur de simulation GEONEX. NON TESTÉ sur cette machine (Docker absent).
FROM python:3.13-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONUTF8=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY geonex_engine geonex_engine
EXPOSE 8100
CMD ["uvicorn", "geonex_engine.api:app", "--host", "0.0.0.0", "--port", "8100"]
