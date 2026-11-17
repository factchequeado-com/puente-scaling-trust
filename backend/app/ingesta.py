"""Trae las notas del RSS, las corta en fragmentos y guarda sus vectores.

Uso: python -m app.ingesta
"""

import re
from datetime import datetime
from email.utils import parsedate_to_datetime
from urllib.parse import unquote, urlparse

import feedparser
import httpx
from bs4 import BeautifulSoup

from . import ajustes, config, db, embeddings

MAX_CARACTERES = 900


def _seccion(url: str) -> str:
    partes = urlparse(url).path.strip("/").split("/")
    return partes[0] if partes else ""


def _parrafos(html: str) -> list[str]:
    sopa = BeautifulSoup(html, "html.parser")
    for basura in sopa(["script", "style", "iframe", "figure", "blockquote"]):
        basura.decompose()
    bloques = sopa.find_all(["p", "h2", "h3", "li"]) or [sopa]
    parrafos = []
    for bloque in bloques:
        texto = re.sub(r"\s+", " ", bloque.get_text(" ")).strip()
        if len(texto) > 30:
            parrafos.append(texto)
    return parrafos


def fragmentar(titulo: str, fecha: str, parrafos: list[str]) -> list[str]:
    """Junta párrafos hasta ~900 caracteres. Cada fragmento lleva el título y la fecha
    para que la búsqueda y el generador sepan de qué nota y de cuándo es."""
    encabezado = f"{titulo} ({fecha[:10]})\n"
    fragmentos, actual = [], ""
    for parrafo in parrafos:
        if actual and len(actual) + len(parrafo) > MAX_CARACTERES:
            fragmentos.append(encabezado + actual.strip())
            actual = ""
        actual += parrafo + "\n"
    if actual.strip():
        fragmentos.append(encabezado + actual.strip())
    return fragmentos


def guardar_nota(con, *, url, titulo, seccion, fecha, imagen, fuente, parrafos) -> int:
    """Inserta o reemplaza una nota con sus fragmentos y vectores. Devuelve la cantidad de fragmentos."""
    # Los vectores se calculan antes de escribir para no tener la base bloqueada mientras tanto.
    textos = fragmentar(titulo, fecha, parrafos)
    vectores = embeddings.documentos(textos)
    viejo = con.execute("SELECT id FROM notas WHERE url = ?", (url,)).fetchone()
    if viejo:
        ids = [r["id"] for r in con.execute("SELECT id FROM fragmentos WHERE nota_id = ?", (viejo["id"],))]
        con.executemany("DELETE FROM vec_fragmentos WHERE rowid = ?", [(i,) for i in ids])
        con.execute("DELETE FROM notas WHERE id = ?", (viejo["id"],))

    nota_id = con.execute(
        "INSERT INTO notas (url, titulo, seccion, fecha, imagen, fuente) VALUES (?, ?, ?, ?, ?, ?)",
        (url, titulo, seccion, fecha, imagen, fuente),
    ).lastrowid
    for orden, (texto, vec) in enumerate(zip(textos, vectores)):
        frag_id = con.execute(
            "INSERT INTO fragmentos (nota_id, orden, texto) VALUES (?, ?, ?)", (nota_id, orden, texto)
        ).lastrowid
        con.execute("INSERT INTO vec_fragmentos (rowid, embedding) VALUES (?, ?)", (frag_id, db.vector(vec)))
    return len(textos)


def ingerir_rss(solo_nuevas: bool = True) -> dict:
    db.inicializar()
    respuesta = httpx.get(ajustes.obtener("rss_url"), headers={"User-Agent": "Mozilla/5.0 respuestas-verificadas"}, timeout=30,
                          follow_redirects=True)
    respuesta.raise_for_status()
    feed = feedparser.parse(respuesta.content)

    nuevas = fragmentos = 0
    with db.sesion() as con:
        existentes = {r["url"] for r in con.execute("SELECT url FROM notas")}
        for item in feed.entries:
            url = unquote(item.link).replace(" ", "")
            if solo_nuevas and url in existentes:
                continue
            html = item.get("content", [{}])[0].get("value") or item.get("summary", "")
            parrafos = _parrafos(html)
            if not parrafos:
                continue
            try:
                fecha = parsedate_to_datetime(item.published).isoformat()
            except (TypeError, ValueError, AttributeError):
                fecha = datetime.now().isoformat()
            imagen = (item.get("media_thumbnail") or [{}])[0].get("url")
            fragmentos += guardar_nota(con, url=url, titulo=item.title, seccion=_seccion(url), fecha=fecha,
                                       imagen=imagen, fuente="rss", parrafos=parrafos)
            nuevas += 1
            con.commit()
            print(f"  + {item.title[:80]}")
    return {"notas_nuevas": nuevas, "fragmentos": fragmentos, "en_feed": len(feed.entries)}


if __name__ == "__main__":
    print(ingerir_rss())
