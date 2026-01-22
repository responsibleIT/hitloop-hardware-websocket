FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install Python dependencies
COPY app/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY app /app/app

ENV PORT=5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app.app:create_app()"]
