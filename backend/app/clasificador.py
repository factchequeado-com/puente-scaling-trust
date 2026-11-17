"""Decisiones y puntajes con LiquidAI/d1-2B: una pasada hacia adelante, probabilidades calibradas.

d1 no escribe ni lleva la conversación (eso lo hace el generador): la cuida. Interviene antes y después de
cada turno, y cada decisión tiene pocas opciones a propósito: cada categoría es un lugar más donde equivocarse.
- clasificar: consulta, urgencia o basura. Solo la urgencia corta; lo demás orienta al generador y va al panel
- validar: si un mensaje con notas dice solo lo que está en ellas (y, si responde, si contesta lo preguntado)
- afirma_hechos: si un mensaje sin notas afirma hechos, que entonces no estarían respaldados

Con GPU carga en 8 bits (~2,1 GB: entra en 4 GB junto con harrier en fp16, ~0,35 s por pasada).
Sin GPU carga en CPU con fp32: anda, pero tarda ~17 s por pasada y usa 6 a 8 GB de RAM.
"""

import logging
import threading

from . import config, generador

log = logging.getLogger("uvicorn.error")
_carga = threading.Lock()
_cargado = None

TIPOS = {
    "consulta": "Pregunta por algo, o cuenta o reenvía algo que vio o escuchó (un rumor, una noticia, una cadena, "
                "un mensaje sospechoso), para saber si es cierto o qué se sabe",
    # Un criterio, sin ejemplos: con ejemplos, d1 se guía por las palabras y no por lo que pasa.
    "urgencia": "La persona o alguien cercano enfrenta un peligro real e inmediato y necesita ayuda ahora. Un rumor, "
                "una cadena o una advertencia que circula no es una urgencia, aunque suene alarmante",
    "basura": "No pregunta ni cuenta nada: saludos, agradecimientos, pruebas, insultos o texto sin sentido",
}

TEMAS = {
    "inmigracion": "Inmigración, visas, TPS, asilo, deportaciones, ICE",
    "salud": "Salud, medicamentos, vacunas, seguros médicos",
    "trabajo": "Trabajo, salarios, impuestos, beneficios",
    "vivienda": "Vivienda, alquiler, desalojos",
    "estafas": "Estafas, fraudes y engaños",
    "elecciones": "Elecciones, votación, candidatos, conteo de votos",
    "otros": "Cualquier otro tema",
}

TURNOS_AL_VALIDAR = 2     # el hilo que acompaña la validación: lo justo para entender una repregunta


def _d1():
    # Con lock: si una pregunta llega durante la precarga, espera en vez de cargar el modelo dos veces.
    global _cargado
    with _carga:
        if _cargado is None:
            _cargado = _cargar()
        return _cargado


def _cargar():
    import torch
    from transformers import AutoModel, BitsAndBytesConfig

    opciones = {"revision": config.D1_REVISION, "trust_remote_code": True}
    if torch.cuda.is_available():
        modelo = AutoModel.from_pretrained(config.D1_MODEL, dtype=torch.float16, device_map={"": 0},
                                           quantization_config=BitsAndBytesConfig(load_in_8bit=True), **opciones)
        log.info("d1 cargado en la GPU (8 bits)")
        return modelo
    log.warning("d1 sin GPU: carga en CPU con fp32 y tarda ~17 s por pasada")
    return AutoModel.from_pretrained(config.D1_MODEL, dtype=torch.float32, **opciones).to("cpu")


def _con_hilo(previos: list[dict] | None, **campos) -> dict | str:
    """El estado que lee d1: los campos de este paso y, si hay, la conversación anterior. Un mensaje solo va
    como texto plano, sin envolverlo en JSON."""
    if not previos:
        return campos["mensaje"] if list(campos) == ["mensaje"] else campos
    nombres = {"persona": "persona", "asistente": "asistente", "redaccion": "redacción"}
    hilo = [{"rol": nombres[t["rol"]], "texto": generador.sin_citas(t["texto"])} for t in previos]
    return {"conversacion": hilo, **campos}


def _temas_anteriores(previos: list[dict]) -> list[str]:
    """Los temas del último turno del asistente: de qué venía hablando la conversación."""
    for turno in reversed(previos):
        temas = (turno.get("meta") or {}).get("etiquetas", {}).get("temas")
        if temas:
            return [t for t in temas if t != "otros"]
    return []


def clasificar(texto: str, previos: list[dict] | None = None) -> dict:
    """El tipo y el lugar se leen con el hilo; los temas, con el último mensaje solo. Con el hilo, d1 arrastraba
    el tema anterior a preguntas nuevas («¿cuántos días antes se puede votar?» después de una sobre ICE salía como
    inmigración). Una repregunta sin tema propio («¿y en Texas?») hereda los temas del turno anterior: así no se
    escapa de un tema que la redacción quiere ver siempre. Preguntarle a d1 si el mensaje «sigue el asunto» no
    servía: a «¿y en Texas?» después de ICE le daba 0,16. Las dos lecturas van en una sola llamada."""
    con_hilo = {
        "tipo": {"type": "choice", "instructions": "¿Qué es el último mensaje de la persona?", "criteria": TIPOS},
        "lugar": {"type": "text", "instructions": "¿Qué ciudad, condado o estado menciona la persona?"},
    }
    solo = {"temas": {"type": "choice", "multiple": True, "instructions": "¿De qué temas trata el mensaje?",
                      "criteria": TEMAS}}
    a, b = _d1().system_one_batch([(_con_hilo(previos, mensaje=texto), con_hilo), (texto, solo)])
    a, b = a["answers"], b["answers"]

    temas = b["temas"].get("choices") or ["otros"]
    heredados = temas == ["otros"] and previos and _temas_anteriores(previos)
    if heredados:
        temas = heredados
    lugar = a["lugar"].get("text")
    return {
        "tipo": a["tipo"]["choice"],
        "tipo_conf": float(a["tipo"]["confidence"]),
        "temas": temas,
        "temas_prob": {k: round(float(v), 3) for k, v in (b["temas"].get("probabilities") or {}).items()},
        "temas_heredados": bool(heredados),
        # Con hilo, d1 a veces lee un pedazo del JSON en vez de un nombre: solo se guarda si es corto.
        "lugar": lugar if lugar and len(lugar.split()) <= 4 else None,
    }


def validar(notas: str, pregunta: str, previos: list[dict] | None, respuesta: str, contesta: bool = True) -> dict:
    """Preguntas de sí o no sobre un mensaje con notas, en una pasada. «contesta» solo tiene sentido si el mensaje
    responde (no si pregunta). Si la GPU no da abasto, el mensaje no pasa."""
    import torch

    hilo = f"CONVERSACIÓN PREVIA:\n{generador.conversacion(previos[-TURNOS_AL_VALIDAR:])}\n\n" if previos else ""
    estado = (f"NOTAS PUBLICADAS:\n{notas}\n\n{hilo}PREGUNTA DE LA PERSONA:\n{pregunta}\n\n"
              f"RESPUESTA PROPUESTA:\n{respuesta}")
    preguntas = {
        "respaldo": {"type": "noul", "instructions": "¿Todo lo que afirma la respuesta propuesta está respaldado "
                                                     "por las notas publicadas, sin agregar datos que no estén ahí?"},
        "contesta": {"type": "noul", "instructions": "¿La respuesta propuesta contesta lo que preguntó la persona?"},
    }
    if not contesta:
        del preguntas["contesta"]
    try:
        a = _d1().system_one(estado, preguntas)["answers"]
    except torch.OutOfMemoryError:
        log.warning("d1 sin memoria en la GPU al validar (%d caracteres): el mensaje no pasa", len(estado))
        torch.cuda.empty_cache()
        return {"respaldo": 0.0, "contesta": 0.0 if contesta else None}
    return {"respaldo": float(a["respaldo"]["noul"]),
            "contesta": float(a["contesta"]["noul"]) if contesta else None}


def afirma_hechos(mensaje: str) -> float:
    """Probabilidad de que un mensaje del asistente afirme hechos. Se usa con los mensajes que no citan notas:
    saludar, explicar el servicio o preguntar está bien; afirmar algo sin notas, no."""
    a = _d1().system_one(f"MENSAJE DEL ASISTENTE:\n{mensaje}", {"hechos": {"type": "noul", "instructions":
        "¿El mensaje afirma como cierto algún hecho sobre el mundo, más allá de saludar, explicar cómo funciona "
        "este servicio o hacer una pregunta?"}})["answers"]
    return float(a["hechos"]["noul"])


def precargar() -> None:
    _d1()
