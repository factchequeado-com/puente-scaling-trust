"""Lo que cada medio ajusta desde la redacción, sin tocar código: el nombre, el RSS, la ficha del servicio, los
mensajes fijos y qué tan exigente es el circuito con cada tema.

Se guarda en la tabla `ajustes` (clave → JSON). Lo que no se tocó sale de DEFECTOS, que a su vez toma lo que
venga en el .env.
"""

import json

from . import config, db

# Qué hace el circuito con cada tema:
# - normal: responde solo si d1 da por buena la respuesta con los umbrales de siempre;
# - exigente: igual, con umbrales más altos (lo dudoso va a la redacción);
# - redaccion: no responde, siempre pasa a una persona.
NIVELES = ("normal", "exigente", "redaccion")
ORDEN_NIVELES = {n: i for i, n in enumerate(NIVELES)}

# La ficha del servicio: lo que el asistente sabe de sí mismo. Le llega al generador en cada turno como una nota
# más (la primera), así puede presentarse y explicar qué es esto con una fuente que d1 puede revisar.
FICHA = [
    {"pregunta": "¿Qué es este servicio?",
     "respuesta": "Es el asistente automático de la redacción de {medio}. No es una persona. Responde dudas "
                  "y rumores solo con lo que {medio} publicó. Si tienes dudas sobre cómo funciona, puedes preguntarle."},
    {"pregunta": "¿Quién está detrás?",
     "respuesta": "Lo gestiona la redacción de {medio}. Las personas de la redacción revisan las preguntas que el "
                  "asistente no puede responder."},
    {"pregunta": "¿Cómo funciona?",
     "respuesta": "Busca en las notas que publicó {medio}. Si una nota responde la pregunta, contesta con esa nota y "
                  "la cita. Si no, le pasa la pregunta a la redacción; si alguien responde, la respuesta aparece en "
                  "esta misma conversación."},
    {"pregunta": "¿Qué pasa con mis datos?",
     "respuesta": "La conversación se borra sola a los {plazo} sin mensajes nuevos. Antes de guardar un mensaje se "
                  "quitan los teléfonos, los correos y los números de documento. No hace falta dar datos personales."},
    {"pregunta": "¿Cómo borro la conversación?",
     "respuesta": "Escribiendo «borrar». La conversación se borra en el momento."},
    {"pregunta": "¿Cuesta algo?",
     "respuesta": "No. El servicio es gratuito: no se paga ni se recibe dinero por usarlo."},
    {"pregunta": "¿Qué no puede hacer?",
     "respuesta": "No da asesoría legal, médica ni migratoria para casos personales. No ve imágenes, audios ni "
                  "videos: de los enlaces solo lee el título y los datos básicos."},
]

DEFECTOS = {
    "nombre_medio": config.NOMBRE_MEDIO,
    "rss_url": config.RSS_URL,
    "ficha": FICHA,
    "mensaje_urgencia": "Lo que cuentas parece urgente. Si estás en peligro, llama al 911. Ya avisé a la redacción "
                        "de {medio} para que lo vea una persona lo antes posible.",
    "mensaje_derivada": "Le pasé tu pregunta a la redacción de {medio} para que la revise una persona. Si te "
                        "responden, lo vas a ver en esta conversación. Gracias por escribirnos.",
    "niveles": {},   # tema → nivel; los temas que no están quedan en «normal»
    "avisos_cuando": "todas",   # todas | urgencias | nunca: qué consultas de la bandeja se avisan
    "avisos_emails": [],        # a quién le llega el aviso por email (Slack va al canal del webhook)
}

AVISOS = ("todas", "urgencias", "nunca")


def todos() -> dict:
    with db.sesion() as con:
        guardados = {f["clave"]: json.loads(f["valor"]) for f in con.execute("SELECT clave, valor FROM ajustes")}
    return {clave: guardados.get(clave, defecto) for clave, defecto in DEFECTOS.items()}


def obtener(clave: str):
    with db.sesion() as con:
        fila = con.execute("SELECT valor FROM ajustes WHERE clave = ?", (clave,)).fetchone()
    return json.loads(fila["valor"]) if fila else DEFECTOS[clave]


def guardar(cambios: dict) -> dict:
    desconocidas = set(cambios) - set(DEFECTOS)
    if desconocidas:
        raise ValueError(f"Ajustes desconocidos: {', '.join(sorted(desconocidas))}")
    if "niveles" in cambios and not all(n in NIVELES for n in cambios["niveles"].values()):
        raise ValueError(f"Los niveles posibles son: {', '.join(NIVELES)}")
    if "avisos_cuando" in cambios and cambios["avisos_cuando"] not in AVISOS:
        raise ValueError(f"Los avisos pueden ser: {', '.join(AVISOS)}")
    if "avisos_emails" in cambios:
        cambios["avisos_emails"] = [e.strip() for e in cambios["avisos_emails"] if e.strip()]
        if not all("@" in e for e in cambios["avisos_emails"]):
            raise ValueError("Hay un correo de aviso que no parece un correo")
    with db.sesion() as con:
        con.executemany(
            "INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
            [(clave, json.dumps(valor, ensure_ascii=False)) for clave, valor in cambios.items()],
        )
    return todos()


def medio() -> str:
    return obtener("nombre_medio")


def plazo() -> str:
    """Cuánto vive una conversación sin mensajes nuevos, en palabras: «7 días», «24 horas»."""
    horas = config.VENCIMIENTO_HORAS
    if horas >= 48 and horas % 24 == 0:
        return f"{horas // 24} días"
    return f"{horas} horas"


def _completar(texto_: str) -> str:
    """Reemplaza {medio} y {plazo} en los textos que escribe la redacción."""
    return texto_.replace("{medio}", medio()).replace("{plazo}", plazo())


def texto(clave: str) -> str:
    """Un mensaje fijo, con el nombre del medio y el plazo de borrado."""
    return _completar(obtener(clave))


def ficha_como_nota() -> dict:
    """La ficha con la forma de una nota de la búsqueda, para pasársela al generador y a d1."""
    nombre = medio()
    lineas = [_completar(f"{p['pregunta']} {p['respuesta']}") for p in obtener("ficha")]
    return {"id": 0, "titulo": f"Sobre este servicio de {nombre}", "url": "servicio://ficha", "seccion": "servicio",
            "fecha": None, "similitud": None, "texto": f"Sobre este servicio de {nombre}\n" + "\n".join(lineas)}


def nivel(temas: list[str]) -> str:
    """El nivel más estricto entre los temas del mensaje."""
    niveles = obtener("niveles")
    return max((niveles.get(t, "normal") for t in temas), key=ORDEN_NIVELES.get, default="normal")


def umbrales(nivel_tema: str) -> tuple[float, float]:
    """(respaldo, contesta) que tiene que superar una respuesta para salir sin pasar por la redacción."""
    if nivel_tema == "exigente":
        return config.UMBRAL_RESPALDO_EXIGENTE, config.UMBRAL_CONTESTA_EXIGENTE
    return config.UMBRAL_RESPALDO, config.UMBRAL_CONTESTA
