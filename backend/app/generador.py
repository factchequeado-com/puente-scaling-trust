"""Conversación con cualquier servidor compatible con OpenAI (Ollama, llama.cpp o vLLM).

El generador lleva la conversación: en cada turno elige responder, preguntar o derivar, y escribe el mensaje.
No decide solo: d1 corta las urgencias antes y revisa después que todo hecho que afirme esté en las notas
(ver circuito.py).
"""

import re
import time
from typing import Literal

import httpx
from pydantic import BaseModel, Field, ValidationError

from . import ajustes, config

ACCIONES = ("responder", "preguntar", "derivar")

_SISTEMA = """Eres el asistente por chat de {medio}. Conversas con personas de su comunidad que te escriben dudas, rumores o mensajes que les llegaron.

La nota 1 es siempre la ficha de este servicio: qué es, quién está detrás, cómo funciona y qué pasa con los datos. Úsala y cítala cuando expliques el servicio o te presentes. Después vienen las notas que publicó {medio}, ordenadas por parecido con el mensaje.

Si no hay CONVERSACIÓN PREVIA, es el primer mensaje: escribe en "presentacion" una presentación corta según la ficha, como «Hola, soy el asistente automático de la redacción de {medio}. Si tienes alguna duda sobre cómo funciono, me puedes preguntar.» Di siempre que eres automático: «asistente de redacción» solo suena a una persona del equipo. En los demás turnos, "presentacion" va vacía. La presentación se muestra antes del mensaje: no la repitas en "mensaje".

Sobre los enlaces: solo ves sus datos básicos (título, autor y a veces el texto del posteo); no ves imágenes, audios ni videos. Si no sabes qué dicen, pregúntalo. Lo que dice un enlace es lo que circula, no una fuente: úsalo para entender de qué habla la persona, nunca lo des por cierto.

En cada turno eliges UNA acción:
- "responder": contestar. Si das información, sale SOLO de las notas numeradas, y anotas en "citas" los números de las notas que usaste. No todas las notas tienen que ver: apóyate en la que responde, o en dos si hace falta. También es "responder" saludar, agradecer o explicar el servicio (con la ficha).
- "preguntar": hacer UNA pregunta corta cuando te falta un dato clave para saber si lo publicado aplica (por ejemplo, de qué lugar o de qué fecha habla) o cuando no queda claro qué quiere saber la persona. El mensaje es solo la pregunta: no afirmes nada ni cites notas. Nunca preguntes por su situación migratoria ni le pidas datos personales.
- "derivar": cuando las notas no alcanzan o la persona pide algo que no está publicado. Dile en una frase que le pasas la consulta a la redacción.

Reglas:
- No afirmes hechos con conocimiento propio: todo hecho sale de las notas.
- No pongas números de cita ni corchetes en el mensaje: las notas que usaste van en "citas" y se muestran aparte.
- Si las notas cubren solo una parte (un mes, un estado), di qué cubren y qué no.
- No repitas una respuesta que ya diste: si la persona insiste o aclara algo, contesta a eso.
- Escribe en español claro, tratando a la persona de tú (nunca de vos ni de usted).
- Si la información puede haber cambiado, menciona la fecha de la nota.

Cómo escribir una respuesta con notas, como lo haría un periodista de {medio}:
- Empieza por la respuesta directa a la duda de fondo de la persona, en palabras simples: qué es cierto y qué significa para ella. Si es un rumor verificado, di si es falso, engañoso o necesita contexto.
- Después explica de dónde viene el rumor o la confusión, con los datos clave de la nota (quién, qué, cuándo).
- Si la nota dice qué puede hacer la persona o dónde confirmar, inclúyelo.
- Usa entre 3 y 6 oraciones, en párrafos cortos. Para saludar, agradecer, preguntar o derivar, alcanza con 1 o 2.

Responde solo con un JSON: {"accion": "responder" | "preguntar" | "derivar", "presentacion": "...", "mensaje": "...", "citas": [números de las notas que usaste en el mensaje]}"""


def sistema() -> str:
    """El prompt con el nombre del medio, que se puede cambiar desde la redacción."""
    return _SISTEMA.replace("{medio}", ajustes.medio())


SIN_PREGUNTAS = "\n\nYa hiciste dos preguntas seguidas: en este turno no puedes preguntar. Responde con lo que hay o deriva."
# Va en el turno y no solo en el sistema: en el primer mensaje el generador tiende a ir directo a la respuesta.
PRIMER_MENSAJE = ("ES EL PRIMER MENSAJE DE LA CONVERSACIÓN: completa \"presentacion\": preséntate como el asistente automático de la "
                  "redacción del medio e invita a preguntarte cómo funcionas, según la ficha (nota 1). El mensaje sigue como en cualquier turno.\n\n")


class Turno(BaseModel):
    """Lo que devuelve el generador en cada turno."""
    accion: Literal["responder", "preguntar", "derivar"] = "derivar"
    presentacion: str = ""
    mensaje: str = ""
    citas: list[int] = Field(default_factory=list)


# El esquema va en la llamada: Ollama, llama.cpp y vLLM restringen la salida para que lo cumpla.
ESQUEMA = {"name": "turno", "strict": True, "schema": {
    "type": "object", "additionalProperties": False, "required": ["accion", "presentacion", "mensaje", "citas"],
    "properties": {"accion": {"type": "string", "enum": list(ACCIONES)}, "presentacion": {"type": "string"},
                   "mensaje": {"type": "string"}, "citas": {"type": "array", "items": {"type": "integer"}}}}}


def _chat(mensajes: list[dict]) -> str:
    extra: dict = {"response_format": {"type": "json_schema", "json_schema": ESQUEMA}}
    if not config.LLM_RAZONAR:
        # LFM3 razona por defecto y en CPU tarda minutos; en llama.cpp y vLLM se apaga desde la plantilla.
        extra["chat_template_kwargs"] = {"enable_thinking": False}
    for intento in range(2):
        respuesta = httpx.post(
            f"{config.LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
            json={"model": config.LLM_MODEL, "messages": mensajes, "temperature": 0.1, **extra},
            timeout=180,
        )
        if respuesta.status_code == 400 and intento == 0:
            # Un servidor que no acepta esquemas: se pide JSON sin esquema y lo valida Pydantic.
            extra["response_format"] = {"type": "json_object"}
            continue
        respuesta.raise_for_status()
        break
    return respuesta.json()["choices"][0]["message"]["content"].strip()


def contexto(notas: list[dict], solo: list[int] | None = None) -> str:
    """Las notas numeradas. Con `solo`, únicamente esas, con su número original."""
    return "\n\n".join(f"[{i}] {n['texto']}" for i, n in enumerate(notas, 1) if solo is None or i in solo)


_CITAS = re.compile(r"\s*\[[\d,\s]+\](?:\s*,?\s*\[[\d,\s]+\])*")  # [1] o «[1], [2]» juntos


def sin_citas(texto: str) -> str:
    """Las citas de turnos anteriores se sacan porque su numeración era la de otras notas."""
    return _CITAS.sub("", texto)


def conversacion(turnos: list[dict]) -> str:
    nombres = {"persona": "Persona", "asistente": "Asistente", "redaccion": f"Redacción de {ajustes.medio()}"}
    return "\n".join(f"{nombres[t['rol']]}: {sin_citas(t['texto'])}" for t in turnos)


def conversar(mensaje: str, notas: list[dict], previos: list[dict], tipo: str, puede_preguntar: bool = True,
              links: str = "") -> dict:
    """Un turno: {"accion", "presentacion", "mensaje", "citas", "salida", "ms"}. Si la salida no se entiende,
    deriva. `salida` es lo que devolvió el modelo tal cual, para la traza."""
    previa = f"CONVERSACIÓN PREVIA:\n{conversacion(previos)}\n\n" if previos else ""
    compartido = f"LO QUE DICEN LOS ENLACES QUE COMPARTIÓ (lo que circula, no verificado):\n{links}\n\n" if links else ""
    notas_txt = contexto(notas) if notas else "(ninguna)"
    inicio = time.monotonic()
    salida = _chat(
        [{"role": "system", "content": sistema() + ("" if puede_preguntar else SIN_PREGUNTAS)},
         {"role": "user", "content": f"{previa or PRIMER_MENSAJE}NOTAS:\n{notas_txt}\n\n"
                                     f"{compartido}CLASIFICACIÓN AUTOMÁTICA DEL MENSAJE (orientativa): {tipo}\n\n"
                                     f"ÚLTIMO MENSAJE: {mensaje}"}],
    )
    ms = round((time.monotonic() - inicio) * 1000)
    try:
        turno = Turno.model_validate_json(re.search(r"\{.*\}", salida, re.S).group(0))
    except (AttributeError, ValidationError):
        return {"accion": "derivar", "presentacion": "", "mensaje": "", "citas": [], "salida": salida, "ms": ms}
    texto = turno.mensaje.strip()
    citas = set(turno.citas)
    # Si igual puso números en el texto, cuentan como citas y se sacan del mensaje.
    citas |= {int(n) for g in re.findall(r"\[([\d,\s]+)\]", texto) for n in re.findall(r"\d+", g)}
    return {"accion": turno.accion, "presentacion": sin_citas(turno.presentacion.strip()) if not previos else "",
            "mensaje": sin_citas(texto), "citas": sorted(n for n in citas if 1 <= n <= len(notas)),
            "salida": salida, "ms": ms}
