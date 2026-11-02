"""Embeddings con harrier-oss-v1-0.6b.

En la GPU va en fp16 (1,2 GB) para dejarle lugar a d1 en 8 bits (~2,1 GB): los dos entran en 4 GB. Si no
entra (otro programa ocupa la VRAM: Chrome, por ejemplo, carga su modelo local de IA), va a la CPU en fp32.
Los vectores de las dos opciones son compatibles (coseno > 0,999).
"""

import logging
import threading

from . import config

log = logging.getLogger("uvicorn.error")
_carga = threading.Lock()
_cargado = None


def _modelo():
    # Con lock: si una pregunta llega durante la precarga, espera en vez de cargar el modelo dos veces.
    global _cargado
    with _carga:
        if _cargado is None:
            _cargado = _cargar()
        return _cargado


def _sin_memoria(error: Exception) -> bool:
    return "out of memory" in str(error).lower()


def _pasar_a_cpu():
    """Si la GPU se llena después de cargar (Chrome vuelve a cargar su modelo), seguimos en CPU."""
    global _cargado
    import torch

    with _carga:
        if _cargado is not None and _cargado.device.type == "cuda":
            log.warning("la GPU se quedó sin memoria; harrier pasa a la CPU")
            _cargado = None
            torch.cuda.empty_cache()
            _cargado = _cargar(solo_cpu=True)


def _codificar(textos: list[str], **kwargs):
    try:
        return _modelo().encode(textos, normalize_embeddings=True, **kwargs)
    except RuntimeError as error:  # incluye torch.OutOfMemoryError y "CUDA error: out of memory"
        if not _sin_memoria(error):
            raise
        _pasar_a_cpu()
        return _modelo().encode(textos, normalize_embeddings=True, **kwargs)


def _cargar(solo_cpu: bool = False):
    import torch
    from sentence_transformers import SentenceTransformer

    gpu = torch.cuda.is_available() and not solo_cpu
    opciones = [("cuda", torch.float16)] if gpu else []
    for device, dtype in [*opciones, ("cpu", torch.float32)]:
        try:
            modelo = SentenceTransformer(config.EMBED_MODEL, device=device, model_kwargs={"dtype": dtype})
            log.info("harrier cargado en %s (%s)", device, dtype)
            return modelo
        except RuntimeError as error:
            if not _sin_memoria(error):
                raise
            log.warning("harrier no entra en %s con %s; pruebo la siguiente opción", device, dtype)
            torch.cuda.empty_cache()
    raise RuntimeError("no se pudo cargar harrier")


def documentos(textos: list[str]) -> list[list[float]]:
    return _codificar(textos, batch_size=8).tolist()


def consulta(texto: str) -> list[float]:
    return _codificar([texto], prompt_name="web_search_query")[0].tolist()
