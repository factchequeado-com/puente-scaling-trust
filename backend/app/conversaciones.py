"""Conversaciones del chat: viven en el servidor y se borran solas a las VENCIMIENTO_HORAS sin mensajes.

El circuito las usa para entender las repreguntas sin reescribirlas: el clasificador y el generador leen
el hilo, la búsqueda también busca con los mensajes anteriores y se arrastran los fragmentos que ya
respaldaron una respuesta.
"""

import json
import secrets

from . import config, db


def purgar() -> None:
    with db.sesion() as con:
        con.execute("DELETE FROM conversaciones WHERE actualizada < datetime('now', ?)",
                    (f"-{config.VENCIMIENTO_HORAS} hours",))
        con.execute("DELETE FROM trazas WHERE creada < datetime('now', ?)", (f"-{config.TRAZAS_DIAS} days",))


def abrir(conversacion_id: str | None) -> str:
    """Devuelve la conversación si sigue vigente; si no, empieza una nueva."""
    purgar()
    with db.sesion() as con:
        if conversacion_id and con.execute("SELECT 1 FROM conversaciones WHERE id = ?",
                                           (conversacion_id,)).fetchone():
            return conversacion_id
        nueva = secrets.token_urlsafe(16)
        con.execute("INSERT INTO conversaciones (id) VALUES (?)", (nueva,))
        return nueva


def turnos(conversacion_id: str, ultimos: int = -1) -> list[dict]:
    with db.sesion() as con:
        filas = con.execute(
            """SELECT * FROM (SELECT * FROM turnos WHERE conversacion_id = ? ORDER BY id DESC LIMIT ?)
               ORDER BY id""",
            (conversacion_id, ultimos),
        ).fetchall()
    return [{"rol": f["rol"], "texto": f["texto"], "meta": json.loads(f["meta"] or "{}"),
             "fragmentos": json.loads(f["fragmentos"] or "[]")} for f in filas]


def obtener(conversacion_id: str) -> list[dict] | None:
    """Todos los turnos, o None si la conversación ya venció."""
    purgar()
    with db.sesion() as con:
        if not con.execute("SELECT 1 FROM conversaciones WHERE id = ?", (conversacion_id,)).fetchone():
            return None
    return turnos(conversacion_id)


def borrar(conversacion_id: str) -> None:
    """Cuando la persona escribe «borrar»: se va la conversación y, de sus consultas, el texto, el hilo y los
    links, y sus trazas. Quedan solo las etiquetas (tipo, temas, lugar). Lo pendiente en la bandeja se cierra, porque ya no
    hay a quién responderle."""
    with db.sesion() as con:
        con.execute("DELETE FROM trazas WHERE conversacion_id = ?", (conversacion_id,))
        con.execute(
            """UPDATE consultas SET estado = 'cerrada', motivo = 'borrada', resuelta_en = datetime('now')
               WHERE conversacion_id = ? AND estado = 'derivada' AND resuelta_en IS NULL""",
            (conversacion_id,),
        )
        con.execute("UPDATE consultas SET texto = NULL, hilo = NULL, links = NULL, conversacion_id = NULL "
                    "WHERE conversacion_id = ?", (conversacion_id,))
        con.execute("DELETE FROM conversaciones WHERE id = ?", (conversacion_id,))


def agregar(conversacion_id: str, rol: str, texto: str, meta: dict | None = None,
            fragmentos: list[int] | None = None) -> bool:
    """Suma un turno y renueva el vencimiento. Devuelve False si la conversación ya no existe."""
    with db.sesion() as con:
        if not con.execute("UPDATE conversaciones SET actualizada = datetime('now') WHERE id = ?",
                           (conversacion_id,)).rowcount:
            return False
        con.execute("INSERT INTO turnos (conversacion_id, rol, texto, meta, fragmentos) VALUES (?, ?, ?, ?, ?)",
                    (conversacion_id, rol, texto, json.dumps(meta or {}, ensure_ascii=False),
                     json.dumps(fragmentos or [])))
    return True
