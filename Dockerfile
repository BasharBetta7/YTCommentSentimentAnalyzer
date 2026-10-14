FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1


COPY requirements-api.txt .

RUN pip install -r requirements-api.txt

RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY backend/ backend/

COPY src/ src/

COPY models/distillbert/checkpoint-49587 models/distillbert/checkpoint-49587

COPY saved_tokenizer/ saved_tokenizer/


EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]