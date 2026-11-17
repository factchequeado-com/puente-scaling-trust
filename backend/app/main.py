"""API de Respuestas Verificadas. Desarrollo: uvicorn app.main:app --reload --port 8000

Rutas públicas: el chat (/api/chat y lo que necesita para retomar una conversación) y el webhook de Meta.
Todo lo de la redacción pide sesión (usuarios.py); configurar el medio y el equipo, además, rol admin.
"""

import json
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ajustes, avisos, canales, circuito, clasificador, config, conversaciones, db, embeddings, ingesta, usuarios
from .usuarios import requiere_admin, requiere_usuario

FRONT_DIST = config.BASE_DIR.parent / "frontend" / "dist"

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


def _precargar():
    embeddings.consulta("precarga")
    clasificador.precargar()


@asynccontextmanager
async def lifespan(_app):
    db.inicializar()
    conversaciones.purgar()
    threading.Thread(target=_precargar, daemon=True).start()
    yield


app = FastAPI(title="Respuestas Verificadas", lifespan=lifespan)


class Mensaje(BaseModel):
    texto: str = Field(min_length=2, max_length=2000)
    conversacion_id: str | None = Field(default=None, max_length=64)


class RespuestaRedaccion(BaseModel):
    respuesta: str = Field(min_length=2)
    sumar_a_base: bool = True
    # Cómo queda la pregunta en la base. Una repregunta («¿y en Texas?») no se entiende sin el hilo.
    pregunta: str | None = Field(default=None, max_length=300)


@app.post("/api/chat")
def chat(mensaje: Mensaje):
    def eventos():
        try:
            for evento in circuito.procesar(mensaje.texto, mensaje.conversacion_id):
                yield f"data: {json.dumps(evento, ensure_ascii=False)}\n\n"
        except Exception as error:  # el chat tiene que enterarse aunque falle un modelo
            yield f"data: {json.dumps({'tipo': 'error', 'mensaje': str(error)})}\n\n"

    return StreamingResponse(eventos(), media_type="text/event-stream")


@app.get("/api/conversaciones/{conversacion_id}")
def conversacion(conversacion_id: str):
    """Para que el chat recupere la conversación al recargar la página. 404 si ya venció."""
    turnos = conversaciones.obtener(conversacion_id)
    if turnos is None:
        raise HTTPException(404)
    return [{"rol": t["rol"], "texto": t["texto"], **t["meta"]} for t in turnos]


@app.get("/api/consultas/{consulta_id}/respuesta")
def respuesta_de_redaccion(consulta_id: int):
    """El chat consulta esto mientras la pestaña sigue abierta, para mostrar la respuesta de la redacción."""
    with db.sesion() as con:
        fila = con.execute("SELECT respuesta_redaccion, resuelta_en FROM consultas WHERE id = ?",
                           (consulta_id,)).fetchone()
    if not fila:
        raise HTTPException(404)
    return {"respuesta": fila["respuesta_redaccion"], "resuelta_en": fila["resuelta_en"]}


def _consulta(fila) -> dict:
    d = dict(fila)
    d["temas"] = json.loads(d["temas"] or "[]")
    d["fuentes"] = json.loads(d["fuentes"] or "[]")
    d["hilo"] = json.loads(d["hilo"] or "[]")
    d["links"] = json.loads(d.get("links") or "[]")
    return d


@app.get("/api/bandeja")
def bandeja(pendientes: bool = True, _u: dict = Depends(requiere_usuario)):
    filtro = "AND resuelta_en IS NULL" if pendientes else ""
    with db.sesion() as con:
        filas = con.execute(
            f"SELECT * FROM consultas WHERE estado = 'derivada' {filtro} ORDER BY urgencia DESC, creada DESC LIMIT 200"
        ).fetchall()
    return [_consulta(f) for f in filas]


@app.get("/api/automaticas")
def automaticas(_u: dict = Depends(requiere_usuario)):
    """Lo que el asistente respondió solo. La pregunta no se guarda en la consulta: se toma de la conversación
    mientras exista (se borra a los VENCIMIENTO_HORAS); después queda solo la respuesta con sus notas."""
    with db.sesion() as con:
        filas = con.execute(
            """SELECT c.*, (
                   SELECT p.texto FROM turnos a JOIN turnos p ON p.conversacion_id = a.conversacion_id
                   WHERE a.rol = 'asistente' AND json_extract(a.meta, '$.consulta_id') = c.id
                     AND p.rol = 'persona' AND p.id < a.id
                   ORDER BY p.id DESC LIMIT 1) AS pregunta
               FROM consultas c WHERE c.estado = 'respondida' ORDER BY c.creada DESC LIMIT 200"""
        ).fetchall()
    consultas = []
    for f in filas:
        d = _consulta(f)
        d["texto"] = d.pop("pregunta")
        consultas.append(d)
    return consultas


@app.post("/api/bandeja/{consulta_id}/responder")
def responder(consulta_id: int, cuerpo: RespuestaRedaccion, _u: dict = Depends(requiere_usuario)):
    with db.sesion() as con:
        fila = con.execute("SELECT * FROM consultas WHERE id = ?", (consulta_id,)).fetchone()
        if not fila:
            raise HTTPException(404)
        con.execute("UPDATE consultas SET respuesta_redaccion = ?, resuelta_en = datetime('now') WHERE id = ?",
                    (cuerpo.respuesta, consulta_id))
        pregunta = (cuerpo.pregunta or "").strip() or fila["texto"]
        if cuerpo.sumar_a_base and pregunta:
            # La respuesta de la redacción entra a la base: la próxima vez el sistema responde solo.
            ingesta.guardar_nota(
                con, url=f"redaccion://consulta/{consulta_id}", titulo=pregunta[:140], seccion="redaccion",
                fecha=fila["creada"].replace(" ", "T"), imagen=None, fuente="redaccion",
                parrafos=[f"Pregunta de la comunidad: {pregunta}",
                          f"Respuesta de la redacción: {cuerpo.respuesta}"],
            )
    enviado = False
    if fila["conversacion_id"]:
        # Si la conversación sigue vigente, la respuesta queda en el hilo: la persona la ve al volver
        # y el asistente la tiene en cuenta en lo que siga preguntando. Si vino por WhatsApp o Meta, se le manda.
        if conversaciones.agregar(fila["conversacion_id"], "redaccion", cuerpo.respuesta,
                                  meta={"consulta_id": consulta_id}):
            enviado = canales.avisar_respuesta(fila["conversacion_id"], cuerpo.respuesta)
    return {"ok": True, "enviado_por_canal": enviado}


class Idea(BaseModel):
    idea: bool


@app.post("/api/bandeja/{consulta_id}/idea")
def marcar_idea(consulta_id: int, cuerpo: Idea, _u: dict = Depends(requiere_usuario)):
    """Marca la consulta como idea para una nota: lo que pregunta la comunidad y todavía no está publicado."""
    with db.sesion() as con:
        con.execute("UPDATE consultas SET idea = ? WHERE id = ?", (int(cuerpo.idea), consulta_id))
    return {"ok": True}


@app.post("/api/bandeja/{consulta_id}/descartar")
def descartar(consulta_id: int, _u: dict = Depends(requiere_usuario)):
    with db.sesion() as con:
        con.execute("UPDATE consultas SET estado = 'cerrada', motivo = 'descartada', "
                    "resuelta_en = datetime('now') WHERE id = ?", (consulta_id,))
    return {"ok": True}


@app.get("/api/consultas/{consulta_id}/traza")
def traza(consulta_id: int, _u: dict = Depends(requiere_usuario)):
    """Qué pasó en ese turno: tiempos por paso, salida cruda del generador y medidas de d1."""
    with db.sesion() as con:
        fila = con.execute("SELECT datos, creada FROM trazas WHERE consulta_id = ?", (consulta_id,)).fetchone()
    if not fila:
        raise HTTPException(404)
    return {"creada": fila["creada"], **json.loads(fila["datos"])}


@app.get("/api/panel")
def panel(dias: int = 7, _u: dict = Depends(requiere_usuario)):
    rango = f"-{int(dias)} days"
    previo = f"-{int(dias) * 2} days"
    with db.sesion() as con:
        estados = {r["estado"]: r["n"] for r in con.execute(
            "SELECT estado, COUNT(*) n FROM consultas WHERE creada >= datetime('now', ?) GROUP BY estado", (rango,))}
        motivos = [dict(r) for r in con.execute(
            "SELECT motivo, COUNT(*) n FROM consultas WHERE estado = 'derivada' AND creada >= datetime('now', ?) "
            "GROUP BY motivo ORDER BY n DESC", (rango,))]
        temas = [dict(r) for r in con.execute(
            """SELECT j.value tema, COUNT(*) total,
                      SUM(c.estado = 'respondida') respondidas,
                      SUM(c.estado = 'derivada') derivadas,
                      SUM(c.estado = 'derivada' AND c.motivo IN ('sin_resultados', 'sin_respaldo', 'validacion'))
                          sin_respuesta
               FROM consultas c, json_each(c.temas) j
               WHERE c.creada >= datetime('now', ?)
               GROUP BY j.value ORDER BY sin_respuesta DESC, total DESC""", (rango,))]
        lugares = [dict(r) for r in con.execute(
            """SELECT lugar,
                      SUM(creada >= datetime('now', ?)) actual,
                      SUM(creada < datetime('now', ?) AND creada >= datetime('now', ?)) anterior
               FROM consultas WHERE intencion = 'consulta' AND lugar IS NOT NULL AND lugar != ''
               GROUP BY lugar HAVING actual > 0 ORDER BY actual DESC LIMIT 10""", (rango, rango, previo))]
        serie = [dict(r) for r in con.execute(
            """SELECT date(creada) dia, SUM(estado = 'respondida') respondidas, SUM(estado = 'derivada') derivadas,
                      SUM(estado = 'cerrada') cerradas
               FROM consultas WHERE creada >= datetime('now', ?) GROUP BY dia ORDER BY dia""", (rango,))]
        tiempo = con.execute(
            "SELECT AVG((julianday(resuelta_en) - julianday(creada)) * 24 * 60) m FROM consultas "
            "WHERE estado = 'derivada' AND resuelta_en IS NOT NULL AND creada >= datetime('now', ?)", (rango,)
        ).fetchone()["m"]
        pendientes = con.execute(
            "SELECT COUNT(*) n FROM consultas WHERE estado = 'derivada' AND resuelta_en IS NULL").fetchone()["n"]
    return {"dias": dias, "estados": estados, "motivos": motivos, "temas": temas, "lugares": lugares,
            "serie": serie, "minutos_respuesta": tiempo, "pendientes": pendientes}


@app.get("/api/notas")
def notas(_u: dict = Depends(requiere_usuario)):
    with db.sesion() as con:
        filas = con.execute(
            """SELECT n.id, n.titulo, n.url, n.seccion, n.fecha, n.fuente, n.imagen, COUNT(f.id) fragmentos
               FROM notas n LEFT JOIN fragmentos f ON f.nota_id = n.id
               GROUP BY n.id ORDER BY n.fecha DESC"""
        ).fetchall()
    return [dict(f) for f in filas]


@app.post("/api/ingesta")
def actualizar_rss(_u: dict = Depends(requiere_usuario)):
    return ingesta.ingerir_rss()


@app.get("/api/estado")
def estado():
    """Público: el chat lo usa para mostrar el nombre del medio, y la redacción para saber si falta el primer admin."""
    return {"medio": ajustes.medio(), "generador": config.LLM_MODEL, "clasificador": config.D1_MODEL,
            "embeddings": config.EMBED_MODEL, "hay_usuarios": usuarios.hay_usuarios(), "plazo": ajustes.plazo()}


# --- Sesión y equipo ---------------------------------------------------------------------------------------

class Credenciales(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    clave: str = Field(min_length=1, max_length=200)


@app.post("/api/sesion")
def iniciar_sesion(cred: Credenciales, response: Response):
    resultado = usuarios.entrar(cred.email, cred.clave)
    if not resultado:
        raise HTTPException(401, "Correo o clave incorrectos")
    token, usuario = resultado
    response.set_cookie(usuarios.COOKIE, token, httponly=True, samesite="lax", secure=config.SESION_SEGURA,
                        max_age=config.SESION_DIAS * 86400)
    return usuario


@app.delete("/api/sesion")
def cerrar_sesion(request: Request, response: Response):
    if token := request.cookies.get(usuarios.COOKIE):
        usuarios.salir(token)
    response.delete_cookie(usuarios.COOKIE)
    return {"ok": True}


@app.get("/api/sesion")
def quien_soy(usuario: dict = Depends(requiere_usuario)):
    return usuario


class UsuarioNuevo(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    nombre: str = Field(min_length=1, max_length=120)
    clave: str = Field(min_length=10, max_length=200)
    rol: str = "periodista"


class CambioUsuario(BaseModel):
    nombre: str | None = Field(default=None, max_length=120)
    rol: str | None = None
    activo: bool | None = None
    clave: str | None = Field(default=None, min_length=10, max_length=200)


@app.get("/api/usuarios")
def listar_usuarios(_u: dict = Depends(requiere_admin)):
    return usuarios.listar()


@app.post("/api/usuarios")
def crear_usuario(nuevo: UsuarioNuevo, _u: dict = Depends(requiere_admin)):
    try:
        return usuarios.crear(nuevo.email, nuevo.nombre, nuevo.clave, nuevo.rol)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


@app.patch("/api/usuarios/{uid}")
def cambiar_usuario(uid: int, cambio: CambioUsuario, _u: dict = Depends(requiere_admin)):
    try:
        return usuarios.actualizar(uid, **cambio.model_dump())
    except LookupError:
        raise HTTPException(404) from None
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


# --- Ajustes del medio -------------------------------------------------------------------------------------

@app.get("/api/ajustes")
def leer_ajustes(_u: dict = Depends(requiere_usuario)):
    return {**ajustes.todos(), "temas": clasificador.TEMAS, "canales": canales.estado(), "avisos": avisos.estado()}


@app.post("/api/avisos/prueba")
def probar_avisos(_u: dict = Depends(requiere_admin)):
    """Manda un aviso de prueba por Slack y email, y dice qué pasó con cada uno."""
    return avisos.probar()


@app.put("/api/ajustes")
def guardar_ajustes(cambios: dict, _u: dict = Depends(requiere_admin)):
    try:
        return ajustes.guardar(cambios)
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


# --- Webhook de Meta: WhatsApp, Messenger e Instagram (ver canales.py y docs/channels.md) --------------------

@app.get("/webhooks/meta")
def verificar_webhook(modo: str = Query(alias="hub.mode", default=""),
                      token: str = Query(alias="hub.verify_token", default=""),
                      reto: str = Query(alias="hub.challenge", default="")):
    """Meta llama acá una vez, al configurar el webhook, para comprobar que el servidor es nuestro."""
    if modo == "subscribe" and config.META_VERIFY_TOKEN and token == config.META_VERIFY_TOKEN:
        return PlainTextResponse(reto)
    raise HTTPException(403)


@app.post("/webhooks/meta")
async def recibir_webhook(request: Request):
    cuerpo = await request.body()
    if not canales.firma_valida(cuerpo, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(403)
    canales.atender(json.loads(cuerpo or b"{}"))
    return {"ok": True}


# En producción FastAPI sirve el build del front; en desarrollo lo sirve Vite con proxy a /api.
if FRONT_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONT_DIST / "assets"), name="assets")

    @app.get("/{ruta:path}")
    def spa(ruta: str):
        archivo = FRONT_DIST / ruta
        if ruta and archivo.is_file() and FRONT_DIST in archivo.resolve().parents:
            return FileResponse(archivo)
        return FileResponse(FRONT_DIST / "index.html")
