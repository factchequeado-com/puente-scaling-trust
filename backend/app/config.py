"""Configuración por variables de entorno (ver .env.example)."""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# d1 y harrier comparten una GPU de 4 GB: sin esto la memoria se fragmenta y un lote largo no entra.
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


def _float(nombre: str, defecto: float) -> float:
    return float(os.getenv(nombre, defecto))


DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR / "data" / "escucha.db"))
RSS_URL = os.getenv("RSS_URL", "https://factchequeado.com/feed/")
NOMBRE_MEDIO = os.getenv("NOMBRE_MEDIO", "Factchequeado")

# Generador: cualquier servidor compatible con la API de OpenAI (Ollama, vLLM, llama.cpp).
# Para pasar al modelo del brief alcanza con cambiar estas dos variables.
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "gemma4:e4b")
LLM_API_KEY = os.getenv("LLM_API_KEY", "ollama")
# Con LFM3 conviene apagar el razonamiento: el JSON sale igual y tarda una fracción.
LLM_RAZONAR = os.getenv("LLM_RAZONAR", "si").lower() not in ("no", "0", "false")

EMBED_MODEL = os.getenv("EMBED_MODEL", "microsoft/harrier-oss-v1-0.6b")
EMBED_DIM = int(os.getenv("EMBED_DIM", 1024))

# d1 toma todas las decisiones del circuito. La revisión queda fija porque carga código del repo
# (trust_remote_code): sin fijarla, bajaría el código más nuevo sin que nadie lo revise.
D1_MODEL = os.getenv("D1_MODEL", "LiquidAI/d1-2B")
D1_REVISION = os.getenv("D1_REVISION", "10e7671d44e4b37700020b1eed3f594c5f2af0b4")

# La búsqueda trabaja a nivel nota: harrier encuentra fragmentos, gana la nota de cada uno y al generador le
# llegan las mejores notas (tiene contexto de sobra). d1 valida solo las que el generador citó: el tope por
# nota es para que entren dos en una GPU de 4 GB junto con harrier (~3.000 tokens; la nota mediana tiene 7
# fragmentos de ~200 tokens).
NOTAS_POR_CONSULTA = int(os.getenv("NOTAS_POR_CONSULTA", 5))
FRAGMENTOS_POR_NOTA = int(os.getenv("FRAGMENTOS_POR_NOTA", 6))

# Guardia de d1 sobre cada mensaje del generador: preguntas de sí o no. Arrancan exigentes, como pide el brief,
# y se ajustan con un set de evaluación real.
UMBRAL_RESPALDO = _float("UMBRAL_RESPALDO", 0.7)   # todo lo que afirma está en las notas
UMBRAL_CONTESTA = _float("UMBRAL_CONTESTA", 0.5)   # contesta lo que preguntó la persona
UMBRAL_HECHOS = _float("UMBRAL_HECHOS", 0.5)       # un mensaje sin notas no puede afirmar hechos
# Para los temas que la redacción marcó como «exigente» (ver ajustes.py).
UMBRAL_RESPALDO_EXIGENTE = _float("UMBRAL_RESPALDO_EXIGENTE", 0.9)
UMBRAL_CONTESTA_EXIGENTE = _float("UMBRAL_CONTESTA_EXIGENTE", 0.7)

# Sesiones de la redacción. Detrás de HTTPS, SESION_SEGURA=si para que la cookie solo viaje cifrada.
SESION_DIAS = int(os.getenv("SESION_DIAS", 14))
SESION_SEGURA = os.getenv("SESION_SEGURA", "no").lower() in ("si", "sí", "1", "true")

# Canales de Meta (ver docs/channels.md). Sin token, los mensajes salientes se escriben en el log en vez de enviarse.
META_VERIFY_TOKEN = os.getenv("META_VERIFY_TOKEN", "")      # lo inventa el medio y lo pega en la app de Meta
META_APP_SECRET = os.getenv("META_APP_SECRET", "")          # para verificar la firma de cada webhook
META_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v24.0")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
MESSENGER_PAGE_TOKEN = os.getenv("MESSENGER_PAGE_TOKEN", "")
INSTAGRAM_TOKEN = os.getenv("INSTAGRAM_TOKEN", "")

# Avisos a la redacción (ver docs/notifications.md). A quién y cuándo se decide en Ajustes.
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")
SMTP_HOST = os.getenv("SMTP_HOST", "")           # Google Workspace: smtp-relay.gmail.com o smtp.gmail.com
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USUARIO = os.getenv("SMTP_USUARIO", "")
SMTP_CLAVE = os.getenv("SMTP_CLAVE", "")
SMTP_REMITENTE = os.getenv("SMTP_REMITENTE", "")
# La dirección pública del servidor, para los enlaces de los avisos (https://escucha.mimedio.org).
URL_PUBLICA = os.getenv("URL_PUBLICA", "")

# Las conversaciones se borran solas después de este tiempo sin mensajes nuevos.
VENCIMIENTO_HORAS = int(os.getenv("VENCIMIENTO_HORAS", 168))   # una semana
# Las trazas de cada turno (tiempos, salida del generador, medidas de d1) se guardan para revisar decisiones.
TRAZAS_DIAS = int(os.getenv("TRAZAS_DIAS", 30))
