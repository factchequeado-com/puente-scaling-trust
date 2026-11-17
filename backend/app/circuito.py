"""El circuito de un turno: d1 clasifica → harrier trae notas → el generador conversa → d1 revisa → sale.

`procesar` es un generador que va emitiendo los pasos para que el chat los muestre. Cada mensaje se procesa
dentro de su conversación (ver conversaciones.py).

El generador lleva la conversación: en cada turno elige responder, preguntar o derivar, y escribe el mensaje,
así puede saludar, pedir el dato que le falta o reconocer cuando la persona le marca algo. d1 lo cuida sin
frenarlo: antes corta solo las urgencias, y después revisa cada mensaje. Si cita notas, que diga solo lo que
está en ellas; si no cita, que no afirme hechos. Lo que no pasa la revisión no sale: va a la redacción.

De los links se leen los datos clave con oEmbed (título, autor, texto del posteo; ver lector.py): sirven para
buscar y para que el generador entienda de qué habla la persona, pero son lo que circula, nunca una fuente.
"""

import json
import re
import time
import unicodedata
from collections.abc import Iterator
from urllib.parse import unquote, urlparse

from . import ajustes, avisos, busqueda, clasificador, config, conversaciones, db, generador, lector

TURNOS_DE_CONTEXTO = 10      # las últimas cinco idas y vueltas
MENSAJES_PARA_BUSCAR = 2     # mensajes anteriores de la persona que se suman a la búsqueda

MAX_PREGUNTAS_SEGUIDAS = 2   # para que la conversación no se vuelva un interrogatorio
MAX_LINKS = 2                # links que se leen por mensaje
FICHA = 1                    # la ficha del servicio es siempre la nota 1

# La confirmación de «borrar» es del sistema, no del medio. Los mensajes de urgencia y de derivación los
# escribe cada redacción (ver ajustes.py).
BORRADA = "Listo, borré esta conversación. Si me escribes de nuevo, empezamos de cero."

_BORRAR = {"borrar", "borra", "borrar todo", "borrar conversacion", "borrar la conversacion", "borrar mi conversacion",
           "borrala", "borralo"}


def pide_borrar(texto: str) -> bool:
    """«borrar», «Borrar.», «borrar la conversación»: sin acentos ni signos."""
    plano = unicodedata.normalize("NFKD", texto.lower()).encode("ascii", "ignore").decode()
    return " ".join(re.findall(r"[a-z]+", plano)) in _BORRAR

_PATRONES_PII = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[correo]"),
    (re.compile(r"(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}"), "[teléfono]"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[documento]"),
]

_URL = re.compile(r"https?://\S+|www\.\S+")
# Partes de una dirección que no dicen nada del contenido.
_RUIDO_URL = {"www", "com", "org", "net", "html", "htm", "php", "aspx", "amp", "index", "status", "reel", "reels",
              "video", "videos", "watch", "post", "posts", "share", "story", "stories", "live", "channel", "photo",
              "photos", "pfbid", "utm", "source", "medium", "campaign"}


def borrar_datos_personales(texto: str) -> str:
    # TODO: reemplazar las regex por un modelo de anonimización (GLiNER o similar). Hoy solo se borran
    # correos, teléfonos de EE.UU. y números de seguro social: nombres, direcciones y números A quedan.
    # Los links quedan intactos: los IDs de los posteos («…/status/2115132920939602268») parecen teléfonos.
    trozos = re.split(f"({_URL.pattern})", texto)
    return "".join(t if i % 2 else _sin_pii(t) for i, t in enumerate(trozos))


def _sin_pii(texto: str) -> str:
    for patron, reemplazo in _PATRONES_PII:
        texto = patron.sub(reemplazo, texto)
    return texto


def palabras_del_link(url: str) -> list[str]:
    """Las palabras que trae la ruta de un link («…/transgender-sports-surgery-colorado…»). Los códigos de las
    redes («ZSgqpCpgu», «Dd_oODFivP9») mezclan mayúsculas y números, así que quedan afuera."""
    ruta = unquote(urlparse(url if url.startswith("http") else f"http://{url}").path)
    return [p for p in re.split(r"[^A-Za-zÁÉÍÓÚáéíóúÑñÜü]+", ruta)
            if len(p) >= 3 and p.islower() and p not in _RUIDO_URL]


def para_buscar(texto: str) -> str:
    """El texto con cada link reemplazado por las palabras de su dirección."""
    return _URL.sub(lambda m: " " + " ".join(palabras_del_link(m.group(0))) + " ", texto)


def _mensaje(clave: str) -> str:
    return ajustes.texto(f"mensaje_{clave}")


def _guardar(conversacion_id: str, previos: list[dict], estado: str, motivo: str, texto: str, etiquetas: dict,
             **extra) -> int:
    # El texto y el hilo solo quedan en la consulta si alguien de la redacción los tiene que leer.
    texto_guardado = hilo = links = None
    if estado == "derivada":
        texto_guardado = borrar_datos_personales(texto)
        hilo = json.dumps([{"rol": t["rol"], "texto": t["texto"]} for t in previos], ensure_ascii=False)
        links = json.dumps(extra.get("links") or [], ensure_ascii=False)
    with db.sesion() as con:
        return con.execute(
            """INSERT INTO consultas (estado, motivo, texto, intencion, intencion_conf, temas, urgencia, lugar,
                   respaldo, contesta, similitud, respuesta, fuentes, conversacion_id, hilo, links)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (estado, motivo, texto_guardado, etiquetas.get("tipo"), etiquetas.get("tipo_conf"),
             json.dumps(etiquetas.get("temas", []), ensure_ascii=False),
             3 if etiquetas.get("tipo") == "urgencia" else 1, etiquetas.get("lugar"), extra.get("respaldo"),
             extra.get("contesta"), extra.get("similitud"), extra.get("respuesta"),
             json.dumps(extra.get("fuentes", []), ensure_ascii=False), conversacion_id, hilo, links),
        ).lastrowid


def _fin(conversacion_id: str, previos: list[dict], estado: str, motivo: str, texto: str, etiquetas: dict,
         mensaje: str, traza: dict | None = None, **extra) -> dict:
    consulta_id = _guardar(conversacion_id, previos, estado, motivo, texto, etiquetas, **extra)
    if traza is not None:
        _guardar_traza(consulta_id, conversacion_id, traza)
    fin = {"tipo": "fin", "estado": estado, "motivo": motivo, "mensaje": mensaje, "consulta_id": consulta_id,
           "etiquetas": etiquetas, "fuentes": extra.get("fuentes", []), "respaldo": extra.get("respaldo"),
           "contesta": extra.get("contesta"), "hechos": extra.get("hechos"), "similitud": extra.get("similitud")}
    conversaciones.agregar(conversacion_id, "persona", borrar_datos_personales(texto))
    conversaciones.agregar(conversacion_id, "asistente", mensaje,
                           meta={k: v for k, v in fin.items() if k not in ("tipo", "mensaje")})
    if estado == "derivada":
        avisos.avisar({"id": consulta_id, "motivo": motivo, "texto": borrar_datos_personales(texto),
                       "temas": etiquetas.get("temas"), "lugar": etiquetas.get("lugar"),
                       "respuesta": extra.get("respuesta"), "fuentes": extra.get("fuentes")})
    return fin


def _guardar_traza(consulta_id: int, conversacion_id: str, traza: dict) -> None:
    """Qué pasó en el turno: cuánto tardó cada paso, qué devolvió el generador y qué midió d1. Sirve para
    entender una decisión y para armar el set de evaluación. Se borra con «borrar» y a los TRAZAS_DIAS."""
    with db.sesion() as con:
        con.execute("INSERT INTO trazas (consulta_id, conversacion_id, datos) VALUES (?, ?, ?)",
                    (consulta_id, conversacion_id, json.dumps(traza, ensure_ascii=False)))


def _fuentes(citas: list[int], notas: list[dict]) -> list[dict]:
    """Las notas citadas, para mostrarlas. La ficha del servicio (nota 1) no se muestra como fuente."""
    return [{"n": i, "titulo": notas[i - 1]["titulo"], "url": notas[i - 1]["url"],
             "fecha": (notas[i - 1]["fecha"] or "")[:10], "seccion": notas[i - 1]["seccion"]}
            for i in citas if i != FICHA]


def _preguntas_seguidas(previos: list[dict]) -> int:
    n = 0
    for t in reversed([t for t in previos if t["rol"] != "persona"]):
        if t["meta"].get("estado") != "repregunta":
            break
        n += 1
    return n


def procesar(texto: str, conversacion_id: str | None = None) -> Iterator[dict]:
    texto = texto.strip()[:2000]
    if pide_borrar(texto):
        if conversacion_id:
            conversaciones.borrar(conversacion_id)
        yield {"tipo": "borrada", "mensaje": BORRADA}
        return
    conversacion_id = conversaciones.abrir(conversacion_id)
    yield {"tipo": "conversacion", "id": conversacion_id}
    previos = conversaciones.turnos(conversacion_id, ultimos=TURNOS_DE_CONTEXTO)
    etiquetas: dict = {}
    lecturas: list[dict] = []
    presentacion = ""
    traza: dict = {"generador": config.LLM_MODEL, "ms": {}}
    reloj = [time.monotonic()]

    def medir(paso: str) -> None:
        ahora = time.monotonic()
        traza["ms"][paso] = round((ahora - reloj[0]) * 1000)
        reloj[0] = ahora

    def fin(estado: str, motivo: str, mensaje: str, **extra) -> dict:
        # La presentación (primer mensaje) va antes de lo que corresponda, sea respuesta o derivación.
        mensaje = f"{presentacion}\n\n{mensaje}" if presentacion else mensaje
        return _fin(conversacion_id, previos, estado, motivo, texto, etiquetas, mensaje, traza=traza, links=lecturas,
                    **extra)

    yield {"tipo": "paso", "paso": "clasificar"}
    etiquetas = clasificador.clasificar(texto, previos)
    medir("clasificar")
    traza["d1"] = {"tipo": etiquetas["tipo"], "tipo_conf": etiquetas["tipo_conf"], "temas": etiquetas.get("temas")}
    yield {"tipo": "etiquetas", "etiquetas": etiquetas}
    if etiquetas["tipo"] == "urgencia":
        yield fin("derivada", "urgencia", _mensaje("urgencia"))
        return
    # Cada redacción decide qué tan exigente es el circuito con cada tema (ver ajustes.py).
    nivel = ajustes.nivel(etiquetas.get("temas", []))
    if nivel == "redaccion":
        yield fin("derivada", "tema_redaccion", _mensaje("derivada"))
        return
    umbral_respaldo, umbral_contesta = ajustes.umbrales(nivel)
    traza["nivel"] = nivel

    links = [u.rstrip(".,;:)»\"'") for u in _URL.findall(texto)][:MAX_LINKS]
    if links:
        yield {"tipo": "paso", "paso": "leer"}
        lecturas = [lector.leer(u) for u in links]
    contenido = lector.resumen(lecturas)
    leido = " ".join(x for l in lecturas for x in (l.get("titulo"), l.get("texto")) if x)

    yield {"tipo": "paso", "paso": "buscar"}
    anteriores = [t["texto"] for t in previos if t["rol"] == "persona"][-MENSAJES_PARA_BUSCAR:]
    actual = f"{para_buscar(texto)} {leido}".strip()
    textos = [actual] + ([para_buscar(" ".join(anteriores)) + " " + actual] if anteriores else [])
    encontradas = busqueda.notas(*textos)
    medir("buscar")
    similitud = encontradas[0]["similitud"] if encontradas else None
    yield {"tipo": "busqueda", "similitud": similitud, "notas": [n["titulo"] for n in encontradas]}
    # La ficha del servicio va siempre primera: con ella el asistente se presenta y explica qué es esto.
    notas = [ajustes.ficha_como_nota()] + encontradas

    yield {"tipo": "paso", "paso": "generar"}
    puede_preguntar = _preguntas_seguidas(previos) < MAX_PREGUNTAS_SEGUIDAS
    turno = generador.conversar(texto, notas, previos, etiquetas["tipo"], puede_preguntar, links=contenido)
    medir("generar")
    traza["salida"] = borrar_datos_personales(turno["salida"])
    accion, mensaje, citas = turno["accion"], turno["mensaje"], turno["citas"]
    if accion == "preguntar" and not puede_preguntar:
        accion, mensaje = "derivar", ""
    if accion in ("preguntar", "derivar"):
        # Una pregunta o un aviso de derivación no afirman nada de las notas: a lo sumo se presentan con la ficha.
        citas = [c for c in citas if c == FICHA]

    yield {"tipo": "paso", "paso": "validar"}
    if turno["presentacion"]:
        # La presentación se revisa sola, contra la ficha y sin la pregunta de la persona, que no tiene que ver
        # con presentarse: con la pregunta, d1 dudaba (0,48 a 0,98 con el mismo texto); sin ella da 0,98 parejo.
        p = clasificador.validar(generador.contexto(notas, solo=[FICHA]), "", None, turno["presentacion"],
                                 contesta=False)
        traza["d1"]["presentacion"] = p["respaldo"]
        if p["respaldo"] >= config.UMBRAL_RESPALDO:
            presentacion = turno["presentacion"]
    if not mensaje:
        pasa, medidas = False, {}
    elif citas:
        # d1 lee solo las notas que el generador usó: así entran en la GPU aunque haya recibido seis.
        contesta = accion == "responder" and citas != [FICHA]
        v = clasificador.validar(generador.contexto(notas, solo=citas), texto, previos, mensaje, contesta=contesta)
        pasa = v["respaldo"] >= umbral_respaldo and (v["contesta"] is None or v["contesta"] >= umbral_contesta)
        medidas = {"respaldo": v["respaldo"], "contesta": v["contesta"]}
    else:
        hechos = clasificador.afirma_hechos(mensaje)
        pasa = hechos < config.UMBRAL_HECHOS
        medidas = {"hechos": hechos}
        if not pasa and accion == "responder" and encontradas:
            # Responde con información pero no anotó qué notas usó: se revisa contra las dos más parecidas.
            citas = [2, 3][:len(encontradas)]
            v = clasificador.validar(generador.contexto(notas, solo=citas), texto, previos, mensaje)
            pasa = v["respaldo"] >= umbral_respaldo and v["contesta"] >= umbral_contesta
            medidas.update(respaldo=v["respaldo"], contesta=v["contesta"])
    medir("validar")
    traza["d1"].update({k: v for k, v in medidas.items() if k in ("respaldo", "contesta", "hechos")})
    medidas.update(similitud=similitud, respuesta=mensaje, fuentes=_fuentes(citas, notas))

    if accion == "derivar":
        # El aviso lo escribe el generador; si no pasa la revisión, va el mensaje que escribió la redacción.
        yield fin("derivada", "sin_respaldo", mensaje if pasa else _mensaje("derivada"), **medidas)
    elif not pasa:
        yield fin("derivada", "validacion", _mensaje("derivada"), **medidas)
    elif accion == "preguntar":
        yield fin("repregunta", "pregunta", mensaje, **medidas)
    elif any(c != FICHA for c in citas):
        yield fin("respondida", "respaldada", mensaje, **medidas)
    else:
        yield fin("cerrada", "conversacion", mensaje, **medidas)
