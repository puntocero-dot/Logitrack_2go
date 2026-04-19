FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema para OR-Tools y numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Directorio persistente para modelos ML entrenados
# Montar como volumen en producción para persistir el modelo entre reinicios
RUN mkdir -p /app/models
ENV MODEL_DIR=/app/models

EXPOSE 5000

CMD ["python", "app.py"]
