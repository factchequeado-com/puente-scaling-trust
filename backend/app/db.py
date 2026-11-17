"""SQLite + sqlite-vec. Una base por medio: cada instalación atiende a un solo medio."""

import sqlite3
import struct
from contextlib import contextmanager

import sqlite_vec

from . import config

ESQUEMA = f"""
CREATE TABLE IF NOT EXISTS notas (
    id INTEGER PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    titulo TEXT NOT NULL,
    seccion TEXT,
    fecha TEXT,              -- ISO 8601
    imagen TEXT,
    fuente TEXT NOT NULL DEFAULT 'rss'   -- rss | redaccion
);

CREATE TABLE IF NOT EXISTS fragmentos (
    id INTEGER PRIMARY KEY,
    nota_id INTEGER NOT NULL REFERENCES notas(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL,
    texto TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS vec_fragmentos USING vec0(
    embedding float[{config.EMBED_DIM}] distance_metric=cosine
);

-- Las conversaciones del chat se borran solas a las VENCIMIENTO_HORAS sin actividad.
CREATE TABLE IF NOT EXISTS conversaciones (
    id TEXT PRIMARY KEY,
    creada TEXT NOT NULL DEFAULT (datetime('now')),
    actualizada TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS turnos (
    id INTEGER PRIMARY KEY,
    conversacion_id TEXT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
    creado TEXT NOT NULL DEFAULT (datetime('now')),
    rol TEXT NOT NULL,               -- persona | asistente | redaccion
    texto TEXT NOT NULL,             -- el de la persona, sin datos personales
    meta TEXT,                       -- JSON: estado, motivo, fuentes y etiquetas de la respuesta
    fragmentos TEXT                  -- (versión anterior) ids de fragmentos arrastrados entre turnos
);
CREATE INDEX IF NOT EXISTS turnos_conversacion ON turnos(conversacion_id);

-- El texto de lo respondido vive solo en la conversación; acá quedan las etiquetas.
-- De lo que va a la bandeja se guarda el texto y el hilo, para que la redacción lo lea.
CREATE TABLE IF NOT EXISTS consultas (
    id INTEGER PRIMARY KEY,
    creada TEXT NOT NULL DEFAULT (datetime('now')),
    estado TEXT NOT NULL,            -- respondida | derivada | cerrada | repregunta
    motivo TEXT,                     -- por qué se derivó o cerró
    texto TEXT,                      -- solo si se derivó, sin datos personales
    intencion TEXT,                  -- consulta | urgencia | basura
    intencion_conf REAL,
    temas TEXT,                      -- JSON
    urgencia INTEGER,
    lugar TEXT,
    datos_personales REAL,
    respaldo REAL,
    similitud REAL,
    respuesta TEXT,                  -- respuesta automática (si hubo)
    fuentes TEXT,                    -- JSON con las notas citadas
    respuesta_redaccion TEXT,
    resuelta_en TEXT,
    conversacion_id TEXT,            -- para sumarle la respuesta de la redacción mientras exista
    hilo TEXT,                       -- JSON: los turnos anteriores, solo si se derivó
    relevancia REAL,                 -- (versión anterior) puntaje de d1 del mejor fragmento
    contesta REAL,                   -- d1: la respuesta contesta lo que se preguntó
    links TEXT,                      -- JSON: lo que se leyó de los links (oEmbed), solo si se derivó
    idea INTEGER                     -- la redacción la marcó como idea para una nota
);

-- Lo que el medio ajusta desde la redacción (ver ajustes.py): clave → JSON.
CREATE TABLE IF NOT EXISTS ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

-- Las personas de la redacción. admin: además configura el medio y el equipo.
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'periodista',   -- admin | periodista
    clave TEXT NOT NULL,                       -- scrypt: sal$hash
    activo INTEGER NOT NULL DEFAULT 1,
    creado TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY,                    -- sha256 del token de la cookie
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    vence TEXT NOT NULL
);

-- De qué canal viene cada conversación y a quién contestarle. El identificador de la persona (teléfono o id de
-- Meta) se borra junto con la conversación, al vencer (VENCIMIENTO_HORAS) o cuando escribe «borrar».
CREATE TABLE IF NOT EXISTS canales (
    conversacion_id TEXT PRIMARY KEY REFERENCES conversaciones(id) ON DELETE CASCADE,
    canal TEXT NOT NULL,                       -- whatsapp | messenger | instagram
    remitente TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS canales_remitente ON canales(canal, remitente);

-- Una traza por turno (ver circuito._guardar_traza): tiempos, salida del generador y medidas de d1.
CREATE TABLE IF NOT EXISTS trazas (
    consulta_id INTEGER PRIMARY KEY REFERENCES consultas(id) ON DELETE CASCADE,
    conversacion_id TEXT,
    creada TEXT NOT NULL DEFAULT (datetime('now')),
    datos TEXT NOT NULL
);
"""

# Columnas agregadas después de la primera versión: las bases viejas las reciben en inicializar().
COLUMNAS_NUEVAS = {"consultas": {"conversacion_id": "TEXT", "hilo": "TEXT", "relevancia": "REAL", "contesta": "REAL", "links": "TEXT", "idea": "INTEGER"}}


def conectar() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(config.DB_PATH, check_same_thread=False, timeout=30)
    con.row_factory = sqlite3.Row
    con.enable_load_extension(True)
    sqlite_vec.load(con)
    con.enable_load_extension(False)
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


@contextmanager
def sesion():
    con = conectar()
    try:
        yield con
        con.commit()
    finally:
        con.close()


def inicializar() -> None:
    with sesion() as con:
        con.executescript(ESQUEMA)
        for tabla, columnas in COLUMNAS_NUEVAS.items():
            existentes = {r["name"] for r in con.execute(f"PRAGMA table_info({tabla})")}
            for nombre, tipo in columnas.items():
                if nombre not in existentes:
                    con.execute(f"ALTER TABLE {tabla} ADD COLUMN {nombre} {tipo}")


def vector(valores) -> bytes:
    return struct.pack(f"{len(valores)}f", *valores)
