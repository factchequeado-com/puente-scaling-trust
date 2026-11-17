"""WhatsApp, Messenger e Instagram a través de la plataforma de Meta (ver docs/channels.md).

Los tres usan el mismo webhook: Meta manda cada mensaje a POST /webhooks/meta, firmado con el secreto de la app.
El servidor contesta 200 enseguida, procesa el mensaje con el mismo circuito que el chat web y manda la
respuesta con la Graph API. Cada persona tiene una conversación por canal, que se borra igual que en la web.

Sin token configurado, los mensajes salientes se escriben en el log en vez de enviarse: así se puede probar
todo el recorrido con un webhook armado a mano (ver docs/channels.md).
"""

import hashlib
import hmac
import logging
import threading

import httpx

from . import circuito, config, db

log = logging.getLogger("escucha.canales")

SOLO_TEXTO = "Por ahora solo puedo leer mensajes de texto. ¿Me escribes tu pregunta?"


# --- Entrada -------------------------------------------------------------------------------------------------

def firma_valida(cuerpo: bytes, firma: str | None) -> bool:
    """Meta firma cada webhook con HMAC-SHA256 del cuerpo, usando el secreto de la app."""
    if not config.META_APP_SECRET:
        log.warning("META_APP_SECRET vacío: se aceptan webhooks sin verificar la firma (solo para pruebas)")
        return True
    if not firma or not firma.startswith("sha256="):
        return False
    esperada = hmac.new(config.META_APP_SECRET.encode(), cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperada, firma.removeprefix("sha256="))


def mensajes_entrantes(datos: dict) -> list[dict]:
    """Saca de un webhook de Meta los mensajes de las personas: [{canal, remitente, texto | None}].
    `texto` es None cuando mandan algo que no es texto (audio, imagen, ubicación)."""
    entrantes = []
    objeto = datos.get("object")
    for entrada in datos.get("entry", []):
        if objeto == "whatsapp_business_account":
            for cambio in entrada.get("changes", []):
                for m in cambio.get("value", {}).get("messages", []):
                    texto = m.get("text", {}).get("body") if m.get("type") == "text" else None
                    entrantes.append({"canal": "whatsapp", "remitente": m["from"], "texto": texto})
        elif objeto in ("page", "instagram"):
            canal = "messenger" if objeto == "page" else "instagram"
            for evento in entrada.get("messaging", []):
                mensaje = evento.get("message")
                if not mensaje or mensaje.get("is_echo"):   # los ecos son los mensajes que mandamos nosotros
                    continue
                entrantes.append({"canal": canal, "remitente": evento["sender"]["id"], "texto": mensaje.get("text")})
    return entrantes


def atender(datos: dict) -> None:
    """Procesa en segundo plano: Meta reintenta si el webhook tarda más de unos segundos en contestar."""
    for m in mensajes_entrantes(datos):
        threading.Thread(target=_responder, args=(m,), daemon=True).start()


def _conversacion(canal: str, remitente: str) -> str | None:
    with db.sesion() as con:
        fila = con.execute("SELECT conversacion_id FROM canales WHERE canal = ? AND remitente = ?",
                           (canal, remitente)).fetchone()
    return fila["conversacion_id"] if fila else None


def _vincular(conversacion_id: str, canal: str, remitente: str) -> None:
    with db.sesion() as con:
        con.execute("DELETE FROM canales WHERE canal = ? AND remitente = ?", (canal, remitente))
        con.execute("INSERT OR REPLACE INTO canales (conversacion_id, canal, remitente) VALUES (?, ?, ?)",
                    (conversacion_id, canal, remitente))


def _responder(m: dict) -> None:
    canal, remitente = m["canal"], m["remitente"]
    if not m["texto"]:
        enviar(canal, remitente, SOLO_TEXTO)
        return
    anterior = _conversacion(canal, remitente)
    try:
        for evento in circuito.procesar(m["texto"], anterior):
            if evento["tipo"] == "conversacion" and evento["id"] != anterior:
                _vincular(evento["id"], canal, remitente)
            elif evento["tipo"] in ("fin", "borrada"):
                enviar(canal, remitente, _con_fuentes(evento))
    except Exception:
        log.exception("Falló el circuito con un mensaje de %s", canal)


def _con_fuentes(evento: dict) -> str:
    """En los canales no hay tarjetas: las notas citadas van al final, con su enlace."""
    fuentes = [f for f in evento.get("fuentes", []) if f["url"].startswith("http")]
    if not fuentes:
        return evento["mensaje"]
    return evento["mensaje"] + "\n\n" + "\n".join(f"📰 {f['titulo']}\n{f['url']}" for f in fuentes)


# --- Salida --------------------------------------------------------------------------------------------------

def _graph(ruta: str) -> str:
    return f"https://graph.facebook.com/{config.META_GRAPH_VERSION}/{ruta}"


def enviar(canal: str, destinatario: str, texto: str) -> bool:
    """Manda un mensaje de texto. Sin token, lo escribe en el log (modo de prueba)."""
    if canal == "whatsapp":
        token, url = config.WHATSAPP_TOKEN, _graph(f"{config.WHATSAPP_PHONE_NUMBER_ID}/messages")
        cuerpo = {"messaging_product": "whatsapp", "to": destinatario, "type": "text",
                  "text": {"body": texto[:4096], "preview_url": True}}
    elif canal in ("messenger", "instagram"):
        token = config.MESSENGER_PAGE_TOKEN if canal == "messenger" else config.INSTAGRAM_TOKEN
        url = _graph("me/messages")
        cuerpo = {"recipient": {"id": destinatario}, "messaging_type": "RESPONSE", "message": {"text": texto[:2000]}}
    else:
        raise ValueError(f"Canal desconocido: {canal}")

    if not token:
        log.info("[%s, modo de prueba] a %s…: %s", canal, destinatario[:4], texto)
        return False
    try:
        r = httpx.post(url, json=cuerpo, headers={"Authorization": f"Bearer {token}"}, timeout=20)
        r.raise_for_status()
        return True
    except httpx.HTTPError as error:
        log.error("No se pudo enviar por %s: %s", canal, error)
        return False


def avisar_respuesta(conversacion_id: str, texto: str) -> bool:
    """Si la conversación vino por un canal, le manda la respuesta de la redacción a la persona.
    WhatsApp solo deja escribir sin plantilla dentro de las 24 horas desde el último mensaje de la persona: después
    de eso Meta rechaza el envío (haría falta una plantilla aprobada) y queda en el log, aunque la conversación siga."""
    with db.sesion() as con:
        fila = con.execute("SELECT canal, remitente FROM canales WHERE conversacion_id = ?",
                           (conversacion_id,)).fetchone()
    if not fila:
        return False
    return enviar(fila["canal"], fila["remitente"], f"Te respondió la redacción:\n\n{texto}")


def estado() -> dict:
    """Qué canales están configurados, para mostrarlo en la redacción."""
    return {
        "whatsapp": bool(config.WHATSAPP_TOKEN and config.WHATSAPP_PHONE_NUMBER_ID),
        "messenger": bool(config.MESSENGER_PAGE_TOKEN),
        "instagram": bool(config.INSTAGRAM_TOKEN),
        "webhook_verificado": bool(config.META_VERIFY_TOKEN),
        "firma": bool(config.META_APP_SECRET),
    }

