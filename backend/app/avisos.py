"""Avisos a la redacción cuando una consulta llega a la bandeja: por Slack y por email (ver docs/notifications.md).

Cada aviso trae lo mismo que la bandeja: la pregunta (sin datos personales), por qué se derivó, los temas, el
lugar, el borrador del asistente si lo hubo, las notas que encontró y un enlace a la bandeja. La persona que
escribió nunca aparece: ni su teléfono ni su id de canal salen del servidor.

- Slack: un "Incoming Webhook" (SLACK_WEBHOOK_URL), que publica en un canal elegido al crearlo.
- Email: cualquier servidor SMTP (SMTP_*). Con Google Workspace alcanza con el relay SMTP o una contraseña de
  aplicación, sin sumar otro proveedor.

A quién y cuándo se avisa lo decide la redacción en Ajustes. Sin configurar, los avisos se escriben en el log.
Se mandan en segundo plano: un Slack caído no demora la respuesta a la persona.
"""

import logging
import smtplib
import threading
from email.message import EmailMessage

import httpx

from . import ajustes, config

log = logging.getLogger("escucha.avisos")

MOTIVOS = {
    "urgencia": "Parece urgente",
    "tema_redaccion": "Es de un tema que siempre va a la redacción",
    "sin_respaldo": "Las notas publicadas no alcanzan",
    "validacion": "La respuesta del asistente no pasó la revisión",
}


def corresponde(motivo: str) -> bool:
    """Según Ajustes: avisar de todo lo que llega a la bandeja, solo de las urgencias, o de nada."""
    cuando = ajustes.obtener("avisos_cuando")
    return cuando == "todas" or (cuando == "urgencias" and motivo == "urgencia")


def avisar(consulta: dict) -> None:
    """`consulta`: id, motivo, texto, temas, lugar, respuesta (borrador) y fuentes."""
    if corresponde(consulta["motivo"]):
        threading.Thread(target=_enviar_todo, args=(consulta,), daemon=True).start()


def _enviar_todo(consulta: dict) -> None:
    for canal in (_slack, _email):
        try:
            canal(consulta)
        except Exception:
            log.exception("No se pudo mandar un aviso por %s", canal.__name__.strip("_"))


def _enlace(consulta_id: int | None = None) -> str:
    base = config.URL_PUBLICA.rstrip("/") or "http://localhost:8000"
    return f"{base}/redaccion"


def _resumen(c: dict) -> dict:
    urgente = c["motivo"] == "urgencia"
    return {
        "titulo": f"{'🚨 Urgencia' if urgente else 'Nueva consulta en la bandeja'} · {ajustes.medio()}",
        "pregunta": c.get("texto") or "(sin texto)",
        "motivo": MOTIVOS.get(c["motivo"], c["motivo"]),
        "temas": ", ".join(c.get("temas") or []) or "sin tema",
        "lugar": c.get("lugar") or "",
        "borrador": c.get("respuesta") or "",
        "fuentes": [f for f in c.get("fuentes") or [] if str(f.get("url", "")).startswith("http")],
        "enlace": _enlace(c.get("id")),
    }


# --- Slack -----------------------------------------------------------------------------------------------------

def _slack(c: dict) -> None:
    r = _resumen(c)
    contexto = f"*Por qué:* {r['motivo']}  ·  *Temas:* {r['temas']}" + (f"  ·  *Lugar:* {r['lugar']}" if r["lugar"] else "")
    bloques = [
        {"type": "header", "text": {"type": "plain_text", "text": r["titulo"][:150]}},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"> {r['pregunta'][:2800]}"}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": contexto}]},
    ]
    if r["borrador"]:
        bloques.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*Borrador del asistente:*\n{r['borrador'][:2800]}"}})
    if r["fuentes"]:
        bloques.append({"type": "section", "text": {"type": "mrkdwn", "text": "*Notas que encontró:*\n" + "\n".join(
            f"• <{f['url']}|{f['titulo'][:120]}>" for f in r["fuentes"])}})
    bloques.append({"type": "actions", "elements": [
        {"type": "button", "text": {"type": "plain_text", "text": "Abrir la bandeja"}, "url": r["enlace"]}]})
    cuerpo = {"text": f"{r['titulo']}: {r['pregunta'][:200]}", "blocks": bloques}

    if not config.SLACK_WEBHOOK_URL:
        log.info("[slack, sin configurar] %s", cuerpo["text"])
        return
    httpx.post(config.SLACK_WEBHOOK_URL, json=cuerpo, timeout=10).raise_for_status()


# --- Email -----------------------------------------------------------------------------------------------------

def _destinatarios() -> list[str]:
    return [e.strip() for e in ajustes.obtener("avisos_emails") if e.strip()]


def _email(c: dict) -> None:
    destinos = _destinatarios()
    if not destinos:
        return
    r = _resumen(c)
    lineas = [r["pregunta"], "", f"Por qué: {r['motivo']}", f"Temas: {r['temas']}"]
    if r["lugar"]:
        lineas.append(f"Lugar: {r['lugar']}")
    if r["borrador"]:
        lineas += ["", "Borrador del asistente:", r["borrador"]]
    if r["fuentes"]:
        lineas += ["", "Notas que encontró:"] + [f"- {f['titulo']}\n  {f['url']}" for f in r["fuentes"]]
    lineas += ["", f"Responder desde la bandeja: {r['enlace']}"]

    mensaje = EmailMessage()
    mensaje["Subject"] = r["titulo"]
    mensaje["From"] = config.SMTP_REMITENTE or config.SMTP_USUARIO
    mensaje["To"] = ", ".join(destinos)
    mensaje.set_content("\n".join(lineas))

    if not config.SMTP_HOST:
        log.info("[email, sin configurar] a %s: %s", ", ".join(destinos), r["titulo"])
        return
    with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=20) as smtp:
        smtp.starttls()
        if config.SMTP_USUARIO:
            smtp.login(config.SMTP_USUARIO, config.SMTP_CLAVE)
        smtp.send_message(mensaje)


def estado() -> dict:
    """Qué está configurado, para mostrarlo en Ajustes."""
    return {"slack": bool(config.SLACK_WEBHOOK_URL), "email": bool(config.SMTP_HOST),
            "destinatarios": len(_destinatarios())}


def probar() -> dict:
    """Manda un aviso de prueba por todo lo configurado, sin hilo: para ver los errores en la redacción."""
    prueba = {"id": None, "motivo": "sin_respaldo", "texto": "Esto es un aviso de prueba desde Ajustes.",
              "temas": ["otros"], "lugar": "", "respuesta": "", "fuentes": []}
    resultado = {}
    for nombre, canal in (("slack", _slack), ("email", _email)):
        try:
            canal(prueba)
            resultado[nombre] = "enviado" if estado()[nombre] else "sin configurar"
        except Exception as error:
            resultado[nombre] = f"error: {error}"
    if not _destinatarios():
        resultado["email"] = "sin destinatarios"
    return resultado
