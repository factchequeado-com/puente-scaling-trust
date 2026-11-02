"""Lector de links: trae los datos clave de lo que comparte la persona (título, autor, texto del posteo).

Usa oEmbed, el formato que las plataformas exponen para incrustar publicaciones: con las que lo ofrecen sin
autenticación se pide directo; con el resto se busca el oEmbed que anuncia la página y, si no hay, sus
metadatos (og:title, og:description). No se descarga el contenido completo ni se ejecuta nada.

Lo que trae es lo que circula, no una fuente: sirve para entender de qué habla la persona y para buscar mejor.
Hay guardas porque el link lo elige cualquiera: solo http/https, nada que apunte a direcciones internas (ni
siquiera después de un redireccionamiento), tiempo y tamaño máximos y sin cookies.
"""

import ipaddress
import logging
import socket
from functools import lru_cache
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

log = logging.getLogger("uvicorn.error")

TIEMPO = 5.0
MAX_BYTES = 512_000
MAX_SALTOS = 4
AGENTE = "Mozilla/5.0 (compatible; escucha-respuesta/1.0; +https://factchequeado.com)"

# Plataformas con oEmbed público. Facebook e Instagram piden un token de Meta: van por los metadatos.
OEMBED = {
    ("youtube.com", "youtu.be"): "https://www.youtube.com/oembed",
    ("tiktok.com",): "https://www.tiktok.com/oembed",
    ("twitter.com", "x.com"): "https://publish.twitter.com/oembed",
    ("reddit.com",): "https://www.reddit.com/oembed",
    ("vimeo.com",): "https://vimeo.com/api/oembed.json",
}


class LinkNoPermitido(Exception):
    pass


def _seguro(url: str) -> str:
    """El host del link, si es http/https y todas sus direcciones son públicas."""
    partes = urlparse(url)
    if partes.scheme not in ("http", "https") or not partes.hostname:
        raise LinkNoPermitido(url)
    for *_, direccion in socket.getaddrinfo(partes.hostname, partes.port or 443, proto=socket.IPPROTO_TCP):
        if not ipaddress.ip_address(direccion[0]).is_global:
            raise LinkNoPermitido(url)
    return partes.hostname.lower()


def _pedir(cliente: httpx.Client, url: str) -> tuple[str, httpx.Response]:
    """GET siguiendo los redireccionamientos a mano, para revisar cada salto. Devuelve la URL final y la
    respuesta con el cuerpo cortado en MAX_BYTES."""
    for _ in range(MAX_SALTOS + 1):
        _seguro(url)
        with cliente.stream("GET", url) as r:
            if r.is_redirect and "location" in r.headers:
                url = urljoin(url, r.headers["location"])
                continue
            cuerpo = b""
            for parte in r.iter_bytes():
                cuerpo += parte
                if len(cuerpo) >= MAX_BYTES:
                    break
            # El cuerpo ya viene descomprimido: solo se conserva el tipo de contenido.
            return url, httpx.Response(r.status_code, content=cuerpo[:MAX_BYTES],
                                       headers={"content-type": r.headers.get("content-type", "")})
    raise LinkNoPermitido(f"demasiados redireccionamientos: {url}")


def _endpoint(host: str) -> str | None:
    for dominios, endpoint in OEMBED.items():
        if any(host == d or host.endswith("." + d) for d in dominios):
            return endpoint
    return None


def _del_oembed(datos: dict) -> dict:
    texto = None
    if datos.get("html"):  # X manda el texto del posteo dentro del HTML para incrustar
        cita = BeautifulSoup(datos["html"], "html.parser").find("p")
        texto = cita.get_text(" ", strip=True) if cita else None
    return {"proveedor": datos.get("provider_name"), "titulo": datos.get("title"),
            "autor": datos.get("author_name"), "texto": texto}


def _de_la_pagina(html: str, url: str, cliente: httpx.Client) -> dict:
    sopa = BeautifulSoup(html, "html.parser")
    anuncio = sopa.find("link", attrs={"type": "application/json+oembed"})
    if anuncio and anuncio.get("href"):
        try:
            _, r = _pedir(cliente, urljoin(url, anuncio["href"]))
            if r.status_code == 200:
                return _del_oembed(r.json())
        except Exception:  # si el oEmbed anunciado falla, quedan los metadatos
            pass

    def meta(*nombres):
        for n in nombres:
            m = sopa.find("meta", attrs={"property": n}) or sopa.find("meta", attrs={"name": n})
            if m and m.get("content"):
                return m["content"].strip()
        return None

    return {"proveedor": meta("og:site_name"),
            # Sin el <title> de la página: en sitios armados con JavaScript es genérico («TikTok - Make Your Day»).
            "titulo": meta("og:title", "twitter:title"),
            "autor": meta("author", "article:author"),
            "texto": meta("og:description", "twitter:description", "description")}


@lru_cache(maxsize=512)  # los virales llegan repetidos: el mismo link se lee una vez
def leer(url: str) -> dict:
    """{"url", "dominio", "proveedor", "titulo", "autor", "texto"}. Si no se puede leer, quedan url y dominio."""
    lectura = {"url": url, "dominio": urlparse(url).hostname or ""}
    try:
        with httpx.Client(timeout=TIEMPO, headers={"User-Agent": AGENTE, "Accept-Language": "es,en"},
                          follow_redirects=False) as cliente:
            final, r = _pedir(cliente, url)
            host = urlparse(final).hostname.lower()
            lectura["dominio"] = host.removeprefix("www.")
            endpoint = _endpoint(host)
            datos = None
            if endpoint:
                try:
                    o = cliente.get(endpoint, params={"url": final, "format": "json"})
                    if o.status_code == 200:
                        datos = _del_oembed(o.json())
                except (httpx.HTTPError, ValueError):
                    pass
            # Si no hay oEmbed, o viene sin texto (TikTok a veces solo manda el reproductor), van los metadatos.
            vacio = not datos or not (datos.get("titulo") or datos.get("texto"))
            if vacio and r.status_code == 200 and "html" in r.headers.get("content-type", ""):
                datos = {**(datos or {}), **{k: v for k, v in _de_la_pagina(r.text, final, cliente).items() if v}}
            for clave, valor in (datos or {}).items():
                if valor:
                    lectura[clave] = " ".join(str(valor).split())[:1000]
    except (LinkNoPermitido, OSError, httpx.HTTPError) as error:
        log.info("no se pudo leer el link %s: %s", url, error)
    return lectura


def resumen(lecturas: list[dict]) -> str:
    """Las lecturas como texto para los modelos y la búsqueda."""
    lineas = []
    for l in lecturas:
        partes = [l.get("proveedor") or l["dominio"]]
        if l.get("autor"):
            partes.append(f"de {l['autor']}")
        cabeza = " · ".join(partes)
        cuerpo = " — ".join(x for x in (l.get("titulo"), l.get("texto")) if x)
        lineas.append(f"- {cabeza}: {cuerpo}" if cuerpo else f"- {cabeza}: (no se pudo leer el contenido)")
    return "\n".join(lineas)
