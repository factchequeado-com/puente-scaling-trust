"""Búsqueda a nivel nota: harrier encuentra los fragmentos más parecidos y gana la nota de cada uno.

Los fragmentos sirven para buscar (un pedazo chico se parece mejor a una pregunta que una nota entera), pero a
los modelos les llegan las notas: una o dos notas completas se entienden mejor que pedazos de varias mezclados.
"""

from datetime import datetime, timezone

from . import config, db, embeddings

FRAGMENTOS_BUSCADOS = 40   # cuántos fragmentos trae cada búsqueda para elegir entre sus notas


def notas(*textos: str, n: int | None = None) -> list[dict]:
    """Las `n` notas con el fragmento más parecido a alguno de los textos. En una conversación se busca con el
    último mensaje solo y junto con los anteriores: así una repregunta encuentra de qué se venía hablando."""
    n = n or config.NOTAS_POR_CONSULTA
    similitud: dict[int, float] = {}      # por fragmento, la mejor de las búsquedas
    with db.sesion() as con:
        for texto in textos:
            for fila in con.execute(
                "SELECT rowid, distance FROM vec_fragmentos WHERE embedding MATCH ? AND k = ? ORDER BY distance",
                (db.vector(embeddings.consulta(texto)), FRAGMENTOS_BUSCADOS),
            ):
                similitud[fila["rowid"]] = max(similitud.get(fila["rowid"], -1.0), 1 - fila["distance"])
        if not similitud:
            return []
        marcas = ",".join("?" * len(similitud))
        nota_de = {f["id"]: f["nota_id"] for f in con.execute(
            f"SELECT id, nota_id FROM fragmentos WHERE id IN ({marcas})", list(similitud))}

        mejor: dict[int, float] = {}
        for frag, sim in similitud.items():
            mejor[nota_de[frag]] = max(mejor.get(nota_de[frag], -1.0), sim)
        datos = {f["id"]: dict(f) for f in con.execute(
            f"SELECT * FROM notas WHERE id IN ({','.join('?' * len(mejor))})", list(mejor))}
        ahora = datetime.now(timezone.utc)
        elegidas = sorted(mejor, key=lambda i: mejor[i] + _bonus(datos[i]["fecha"], ahora), reverse=True)[:n]

        resultado = []
        for nota_id in elegidas:
            frags = [dict(f) for f in con.execute(
                "SELECT id, orden, texto FROM fragmentos WHERE nota_id = ? ORDER BY orden", (nota_id,))]
            resultado.append({**datos[nota_id], "similitud": mejor[nota_id],
                              "texto": _texto(frags, {f: s for f, s in similitud.items() if nota_de[f] == nota_id})})
    return resultado


def _bonus(fecha: str | None, ahora: datetime) -> float:
    # Hasta 0,03 para lo publicado en los últimos 90 días: desempata, no manda.
    try:
        dias = (ahora - datetime.fromisoformat(fecha)).days
    except (TypeError, ValueError):
        dias = 365
    return 0.03 * max(0, 1 - dias / 90)


def _texto(frags: list[dict], encontrados: dict[int, float]) -> str:
    """La nota entera si tiene hasta FRAGMENTOS_POR_NOTA fragmentos. Si es más larga: el comienzo, los fragmentos
    que encontró la búsqueda y sus vecinos, en el orden de la nota."""
    tope = config.FRAGMENTOS_POR_NOTA
    if len(frags) > tope:
        por_orden = {f["id"]: f["orden"] for f in frags}
        elegidos = [0] + [por_orden[i] for i in sorted(encontrados, key=encontrados.get, reverse=True)]
        for o in list(elegidos):
            elegidos += [o + 1, o - 1]
        quedan = list(dict.fromkeys(o for o in elegidos if 0 <= o < len(frags)))[:tope]
        frags = [f for f in frags if f["orden"] in quedan]
    # Cada fragmento empieza con «título (fecha)»: queda una sola vez, al principio.
    encabezado = frags[0]["texto"].split("\n", 1)[0]
    cuerpos = [f["texto"].split("\n", 1)[-1] for f in frags]
    return encabezado + "\n" + "\n[…]\n".join(_unir(frags, cuerpos))


def _unir(frags: list[dict], cuerpos: list[str]) -> list[str]:
    """Junta los fragmentos seguidos y marca con […] los saltos de lo que se recortó."""
    bloques, anterior = [], None
    for f, cuerpo in zip(frags, cuerpos):
        if anterior is not None and f["orden"] == anterior + 1:
            bloques[-1] += "\n" + cuerpo
        else:
            bloques.append(cuerpo)
        anterior = f["orden"]
    return bloques
