"""Usuarios y sesiones de la redacción: mínimo, en la base local, sin servicios externos.

La clave se guarda con scrypt (biblioteca estándar). La sesión es una cookie con un token al azar; en la base
queda solo su sha256, así una copia de la base no sirve para entrar.

El primer admin se crea desde la terminal:

    python -m app.usuarios crear --email ana@medio.org --nombre "Ana" --rol admin
"""

import argparse
import getpass
import hashlib
import hmac
import secrets
import sys

from fastapi import Cookie, HTTPException

from . import config, db

ROLES = ("admin", "periodista")
COOKIE = "escucha_sesion"


def _hash(clave: str, sal: bytes) -> str:
    return hashlib.scrypt(clave.encode(), salt=sal, n=2**14, r=8, p=1).hex()


def cifrar(clave: str) -> str:
    sal = secrets.token_bytes(16)
    return f"{sal.hex()}${_hash(clave, sal)}"


def coincide(clave: str, guardada: str) -> bool:
    sal, valor = guardada.split("$", 1)
    return hmac.compare_digest(_hash(clave, bytes.fromhex(sal)), valor)


def _publico(fila) -> dict:
    return {"id": fila["id"], "email": fila["email"], "nombre": fila["nombre"], "rol": fila["rol"],
            "activo": bool(fila["activo"]), "creado": fila["creado"]}


def crear(email: str, nombre: str, clave: str, rol: str = "periodista") -> dict:
    if rol not in ROLES:
        raise ValueError(f"El rol tiene que ser uno de: {', '.join(ROLES)}")
    if len(clave) < 10:
        raise ValueError("La clave tiene que tener al menos 10 caracteres")
    with db.sesion() as con:
        try:
            uid = con.execute("INSERT INTO usuarios (email, nombre, rol, clave) VALUES (?, ?, ?, ?)",
                              (email.strip().lower(), nombre.strip(), rol, cifrar(clave))).lastrowid
        except db.sqlite3.IntegrityError:
            raise ValueError("Ya hay un usuario con ese correo") from None
        return _publico(con.execute("SELECT * FROM usuarios WHERE id = ?", (uid,)).fetchone())


def listar() -> list[dict]:
    with db.sesion() as con:
        return [_publico(f) for f in con.execute("SELECT * FROM usuarios ORDER BY nombre")]


def actualizar(uid: int, *, nombre: str | None = None, rol: str | None = None, activo: bool | None = None,
               clave: str | None = None) -> dict:
    if rol is not None and rol not in ROLES:
        raise ValueError(f"El rol tiene que ser uno de: {', '.join(ROLES)}")
    if clave is not None and len(clave) < 10:
        raise ValueError("La clave tiene que tener al menos 10 caracteres")
    cambios = {k: v for k, v in {"nombre": nombre, "rol": rol, "activo": None if activo is None else int(activo),
                                 "clave": None if clave is None else cifrar(clave)}.items() if v is not None}
    with db.sesion() as con:
        if cambios:
            con.execute(f"UPDATE usuarios SET {', '.join(f'{k} = ?' for k in cambios)} WHERE id = ?",
                        (*cambios.values(), uid))
        if activo is False or clave is not None:
            con.execute("DELETE FROM sesiones WHERE usuario_id = ?", (uid,))
        fila = con.execute("SELECT * FROM usuarios WHERE id = ?", (uid,)).fetchone()
        if not fila:
            raise LookupError("No existe ese usuario")
        # Que siempre quede alguien que pueda configurar el medio.
        if not con.execute("SELECT 1 FROM usuarios WHERE rol = 'admin' AND activo = 1").fetchone():
            raise ValueError("Tiene que quedar al menos un admin activo")
        return _publico(fila)


def hay_usuarios() -> bool:
    with db.sesion() as con:
        return con.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone() is not None


def entrar(email: str, clave: str) -> tuple[str, dict] | None:
    """Devuelve (token, usuario) si la clave es correcta."""
    with db.sesion() as con:
        fila = con.execute("SELECT * FROM usuarios WHERE email = ? AND activo = 1",
                           (email.strip().lower(),)).fetchone()
        if not fila or not coincide(clave, fila["clave"]):
            return None
        token = secrets.token_urlsafe(32)
        con.execute("DELETE FROM sesiones WHERE vence < datetime('now')")
        con.execute("INSERT INTO sesiones (token, usuario_id, vence) VALUES (?, ?, datetime('now', ?))",
                    (hashlib.sha256(token.encode()).hexdigest(), fila["id"], f"+{config.SESION_DIAS} days"))
        return token, _publico(fila)


def salir(token: str) -> None:
    with db.sesion() as con:
        con.execute("DELETE FROM sesiones WHERE token = ?", (hashlib.sha256(token.encode()).hexdigest(),))


def de_token(token: str | None) -> dict | None:
    if not token:
        return None
    with db.sesion() as con:
        fila = con.execute(
            """SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
               WHERE s.token = ? AND s.vence > datetime('now') AND u.activo = 1""",
            (hashlib.sha256(token.encode()).hexdigest(),),
        ).fetchone()
    return _publico(fila) if fila else None


# Dependencias de FastAPI para las rutas de la redacción.
def requiere_usuario(escucha_sesion: str | None = Cookie(default=None)) -> dict:
    usuario = de_token(escucha_sesion)
    if not usuario:
        raise HTTPException(401, "Hay que iniciar sesión")
    return usuario


def requiere_admin(escucha_sesion: str | None = Cookie(default=None)) -> dict:
    usuario = requiere_usuario(escucha_sesion)
    if usuario["rol"] != "admin":
        raise HTTPException(403, "Solo un admin puede hacer esto")
    return usuario


def _cli() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.usuarios", description="Usuarios de la redacción")
    sub = parser.add_subparsers(dest="accion", required=True)
    c = sub.add_parser("crear", help="Crea un usuario (la clave se pide por la terminal)")
    c.add_argument("--email", required=True)
    c.add_argument("--nombre", required=True)
    c.add_argument("--rol", choices=ROLES, default="periodista")
    sub.add_parser("listar", help="Lista los usuarios")
    args = parser.parse_args()

    db.inicializar()
    if args.accion == "listar":
        for u in listar():
            print(f"{u['id']:>3}  {u['rol']:<10}  {'activo' if u['activo'] else 'inactivo':<8}  {u['email']}  ({u['nombre']})")
        return
    clave = getpass.getpass("Clave (10 caracteres o más): ")
    if clave != getpass.getpass("Repetir la clave: "):
        sys.exit("Las claves no coinciden")
    try:
        u = crear(args.email, args.nombre, clave, args.rol)
    except ValueError as error:
        sys.exit(str(error))
    print(f"Listo: {u['nombre']} <{u['email']}> ({u['rol']})")


if __name__ == "__main__":
    _cli()
