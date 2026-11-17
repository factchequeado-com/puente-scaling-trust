export type Paso = "clasificar" | "leer" | "buscar" | "generar" | "validar"

export type Etiquetas = {
  tipo: "consulta" | "urgencia" | "basura"
  tipo_conf: number
  temas: string[]
  lugar: string | null
}

export type Fuente = { n: number; titulo: string; url: string; fecha: string; seccion: string }

/** Lo que se leyó de un link con oEmbed: lo que circula, no una fuente. */
export type LinkLeido = {
  url: string
  dominio: string
  proveedor?: string
  titulo?: string
  autor?: string
  texto?: string
}

export type Fin = {
  tipo: "fin"
  estado: "respondida" | "derivada" | "cerrada" | "repregunta"
  motivo: string
  mensaje: string
  consulta_id: number
  etiquetas: Etiquetas
  fuentes: Fuente[]
  respaldo: number | null
  contesta: number | null
  hechos: number | null
  similitud: number | null
}

export type Evento =
  | { tipo: "conversacion"; id: string }
  | { tipo: "borrada"; mensaje: string }
  | { tipo: "paso"; paso: Paso }
  | { tipo: "etiquetas"; etiquetas: Etiquetas }
  | { tipo: "busqueda"; similitud: number | null; notas: string[] }
  | Fin
  | { tipo: "error"; mensaje: string }

export type Consulta = {
  id: number
  creada: string
  estado: string
  motivo: string
  texto: string | null
  intencion: string
  intencion_conf: number
  temas: string[]
  urgencia: number
  lugar: string | null
  respaldo: number | null
  contesta: number | null
  similitud: number | null
  respuesta: string | null
  fuentes: Fuente[]
  respuesta_redaccion: string | null
  resuelta_en: string | null
  hilo: Turno[]
  links: LinkLeido[]
  idea: number | null
}

export type Panel = {
  dias: number
  estados: Record<string, number>
  motivos: { motivo: string; n: number }[]
  temas: { tema: string; total: number; respondidas: number; derivadas: number; sin_respuesta: number }[]
  lugares: { lugar: string; actual: number; anterior: number }[]
  serie: { dia: string; respondidas: number; derivadas: number; cerradas: number }[]
  minutos_respuesta: number | null
  pendientes: number
}

export type Nota = {
  id: number
  titulo: string
  url: string
  seccion: string
  fecha: string
  fuente: string
  imagen: string | null
  fragmentos: number
}

/** Error de la API con su código: 401 es que no hay sesión; 403, que hace falta ser admin. */
export class ErrorApi extends Error {
  status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(ruta, { headers: { "Content-Type": "application/json" }, ...init })
  if (!r.ok) {
    const detalle = await r.json().then((d) => d.detail).catch(() => null)
    throw new ErrorApi(r.status, typeof detalle === "string" ? detalle : `${r.status} ${r.statusText}`)
  }
  return r.json()
}

export type Usuario = { id: number; email: string; nombre: string; rol: "admin" | "periodista"; activo: boolean; creado: string }

export type Nivel = "normal" | "exigente" | "redaccion"

export type Ajustes = {
  nombre_medio: string
  rss_url: string
  ficha: { pregunta: string; respuesta: string }[]
  mensaje_urgencia: string
  mensaje_derivada: string
  niveles: Record<string, Nivel>
  avisos_cuando: "todas" | "urgencias" | "nunca"
  avisos_emails: string[]
}

export type AjustesCompletos = Ajustes & {
  temas: Record<string, string>
  canales: { whatsapp: boolean; messenger: boolean; instagram: boolean; webhook_verificado: boolean; firma: boolean }
  avisos: { slack: boolean; email: boolean; destinatarios: number }
}

export type Turno = { rol: "persona" | "asistente" | "redaccion"; texto: string }

/** Un turno guardado: los del asistente traen además lo que tenía su `fin`; los de la redacción, su consulta. */
export type TurnoGuardado = Turno & Partial<Omit<Fin, "tipo" | "mensaje">>

/** Manda la pregunta y va llamando a `alEvento` con cada paso del circuito (SSE sobre POST).
 * La conversación vive en el servidor hasta que vence (VENCIMIENTO_HORAS); sin `conversacionId` (o si venció) empieza una nueva,
 * y el primer evento trae su id. */
export async function preguntar(texto: string, conversacionId: string | null, alEvento: (e: Evento) => void) {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto, conversacion_id: conversacionId }),
  })
  if (!r.ok || !r.body) throw new Error(`${r.status} ${r.statusText}`)
  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ""
  for (;;) {
    const { value, done } = await lector.read()
    if (done) break
    resto += value
    const bloques = resto.split("\n\n")
    resto = bloques.pop() ?? ""
    for (const bloque of bloques) {
      const linea = bloque.split("\n").find((l) => l.startsWith("data: "))
      if (linea) alEvento(JSON.parse(linea.slice(6)))
    }
  }
}

export const api = {
  conversacion: (id: string) => pedir<TurnoGuardado[]>(`/api/conversaciones/${encodeURIComponent(id)}`),
  respuestaRedaccion: (id: number) =>
    pedir<{ respuesta: string | null; resuelta_en: string | null }>(`/api/consultas/${id}/respuesta`),
  bandeja: (pendientes = true) => pedir<Consulta[]>(`/api/bandeja?pendientes=${pendientes}`),
  automaticas: () => pedir<Consulta[]>("/api/automaticas"),
  responder: (id: number, respuesta: string, sumar_a_base: boolean, pregunta?: string) =>
    pedir(`/api/bandeja/${id}/responder`, {
      method: "POST",
      body: JSON.stringify({ respuesta, sumar_a_base, pregunta }),
    }),
  descartar: (id: number) => pedir(`/api/bandeja/${id}/descartar`, { method: "POST" }),
  idea: (id: number, idea: boolean) =>
    pedir(`/api/bandeja/${id}/idea`, { method: "POST", body: JSON.stringify({ idea }) }),
  panel: (dias = 7) => pedir<Panel>(`/api/panel?dias=${dias}`),
  notas: () => pedir<Nota[]>("/api/notas"),
  ingesta: () =>
    pedir<{ notas_nuevas: number; fragmentos: number; en_feed: number }>("/api/ingesta", { method: "POST" }),
  estado: () =>
    pedir<{ medio: string; generador: string; clasificador: string; embeddings: string; hay_usuarios: boolean; plazo: string }>(
      "/api/estado",
    ),
  entrar: (email: string, clave: string) =>
    pedir<Usuario>("/api/sesion", { method: "POST", body: JSON.stringify({ email, clave }) }),
  salir: () => pedir("/api/sesion", { method: "DELETE" }),
  yo: () => pedir<Usuario>("/api/sesion"),
  usuarios: () => pedir<Usuario[]>("/api/usuarios"),
  crearUsuario: (u: { email: string; nombre: string; clave: string; rol: string }) =>
    pedir<Usuario>("/api/usuarios", { method: "POST", body: JSON.stringify(u) }),
  cambiarUsuario: (id: number, cambio: Partial<Pick<Usuario, "nombre" | "rol" | "activo">> & { clave?: string }) =>
    pedir<Usuario>(`/api/usuarios/${id}`, { method: "PATCH", body: JSON.stringify(cambio) }),
  ajustes: () => pedir<AjustesCompletos>("/api/ajustes"),
  probarAvisos: () => pedir<Record<string, string>>("/api/avisos/prueba", { method: "POST" }),
  guardarAjustes: (cambios: Partial<Ajustes>) =>
    pedir<Ajustes>("/api/ajustes", { method: "PUT", body: JSON.stringify(cambios) }),
}

export const ETIQUETAS: Record<string, string> = {
  consulta: "Consulta",
  basura: "Sin consulta",
  conversacion: "Conversación",
  pregunta: "Pidió un dato",
  informacion: "Información",
  rumor: "Rumor",
  denuncia: "Dato o denuncia",
  urgencia: "Urgencia",
  fuera_de_tema: "Fuera de tema",
  abuso: "Abuso",
  inmigracion: "Inmigración",
  salud: "Salud",
  trabajo: "Trabajo",
  vivienda: "Vivienda",
  estafas: "Estafas",
  elecciones: "Elecciones",
  otros: "Otros",
  sin_resultados: "Sin notas relacionadas",
  sin_respaldo: "Las notas no alcanzan",
  validacion: "No pasó la validación",
  baja_confianza: "Intención dudosa",
  respaldada: "Respaldada",
  descartada: "Descartada",
  borrada: "La persona borró la conversación",
  tema_redaccion: "Tema que siempre va a la redacción",
  repregunta: "Repregunta",
  contenido: "Pidió el contenido",
  lugar: "Pidió el lugar",
  momento: "Pidió el momento",
  detalle: "Pidió más detalles",
}

export const etiqueta = (clave: string) => ETIQUETAS[clave] ?? clave

/** Fechas de SQLite ("2026-10-29 14:03:00") están en UTC. */
export function fechaUTC(s: string) {
  return new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z")
}

export function hace(s: string) {
  const min = Math.round((Date.now() - fechaUTC(s).getTime()) / 60000)
  if (min < 1) return "recién"
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}

export function etiquetaSeccion(s: string) {
  return (
    { verificaciones: "Verificación", teexplicamos: "Te explicamos", institucional: "Institucional", redaccion: "Respuesta de la redacción" }[s] ??
    (s ? s[0].toUpperCase() + s.slice(1) : "Nota")
  )
}
