import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, Check, Clock, ExternalLink, Inbox, Loader2, MessageCircleQuestion, Newspaper, SquarePen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { enlace, horaActual, SUGERENCIAS, type Mensaje } from "@/components/chat/comun"
import { WhatsApp } from "@/components/chat/WhatsApp"
import {
  api,
  etiqueta,
  etiquetaSeccion,
  preguntar,
  type Etiquetas,
  type Fin,
  type Fuente,
  type Paso,
  type TurnoGuardado,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const PASOS: { paso: Paso; texto: string }[] = [
  { paso: "clasificar", texto: "Leyendo tu mensaje" },
  { paso: "leer", texto: "Mirando el link" },
  { paso: "buscar", texto: "Buscando en lo publicado" },
  { paso: "generar", texto: "Escribiendo" },
  { paso: "validar", texto: "Revisando que lo que digo esté publicado" },
]

const id = () => Math.random().toString(36).slice(2)

// El id de la conversación queda en el navegador para retomarla al recargar; el servidor la borra cuando vence.
const CLAVE = "escucha.conversacion"
const leerId = () => {
  try {
    return localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}
const guardarId = (cid: string | null) => {
  try {
    if (cid) localStorage.setItem(CLAVE, cid)
    else localStorage.removeItem(CLAVE)
  } catch {
    /* sin almacenamiento la conversación dura lo que la pestaña */
  }
}

function desdeServidor(turnos: TurnoGuardado[]): Mensaje[] {
  return turnos.map((t, i) => {
    if (t.rol === "redaccion") return { id: `redaccion-${t.consulta_id}`, rol: "asistente", texto: t.texto, deRedaccion: true }
    if (t.rol === "persona") return { id: `t${i}`, rol: "persona", texto: t.texto }
    const fin = { ...t, tipo: "fin", mensaje: t.texto } as Fin
    return { id: `t${i}`, rol: "asistente", texto: t.texto, fin, etiquetas: fin.etiquetas }
  })
}

/** El chat de la audiencia. `variante="whatsapp"` muestra la misma conversación como se vería en WhatsApp. */
export function Chat({
  detalles = false,
  variante = "web",
  className,
}: {
  detalles?: boolean
  variante?: "web" | "whatsapp"
  className?: string
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [conversacionId, setConversacionId] = useState<string | null>(leerId)
  const [medio, setMedio] = useState("Factchequeado")
  const [plazo, setPlazo] = useState("7 días")
  useEffect(() => {
    api
      .estado()
      .then((e) => {
        setMedio(e.medio)
        setPlazo(e.plazo)
      })
      .catch(() => {})
  }, [])
  const lista = useRef<HTMLDivElement>(null)

  // Al abrir, retoma la conversación guardada si todavía no venció.
  useEffect(() => {
    const cid = leerId()
    if (!cid) return
    api
      .conversacion(cid)
      .then((turnos) => setMensajes((ms) => (ms.length ? ms : desdeServidor(turnos))))
      .catch(() => {
        guardarId(null)
        setConversacionId(null)
      })
  }, [])

  function nuevaConversacion() {
    guardarId(null)
    setConversacionId(null)
    setMensajes([])
  }

  // Baja solo dentro del chat: scrollIntoView movería también la página.
  useEffect(() => {
    const el = lista.current
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [mensajes, variante])

  const actualizar = (mid: string, cambio: (m: Mensaje) => Mensaje) =>
    setMensajes((ms) => ms.map((m) => (m.id === mid ? cambio(m) : m)))

  async function enviar(pregunta: string) {
    pregunta = pregunta.trim()
    if (pregunta.length < 2 || ocupado) return
    setTexto("")
    setOcupado(true)
    const mid = id()
    setMensajes((ms) => [
      ...ms,
      { id: id(), rol: "persona", texto: pregunta, hora: horaActual() },
      { id: mid, rol: "asistente", pasos: [] },
    ])
    try {
      await preguntar(pregunta, conversacionId, (e) => {
        if (e.tipo === "conversacion") {
          guardarId(e.id)
          setConversacionId(e.id)
        } else if (e.tipo === "borrada") {
          guardarId(null)
          setConversacionId(null)
          setMensajes([{ id: id(), rol: "asistente", texto: e.mensaje, sistema: true, hora: horaActual() }])
        } else if (e.tipo === "paso") actualizar(mid, (m) => ({ ...m, pasos: [...(m.pasos ?? []), e.paso] }))
        else if (e.tipo === "etiquetas") actualizar(mid, (m) => ({ ...m, etiquetas: e.etiquetas }))
        else if (e.tipo === "fin") actualizar(mid, (m) => ({ ...m, fin: e, texto: e.mensaje, hora: horaActual() }))
        else if (e.tipo === "error") throw new Error(e.mensaje)
      })
    } catch {
      actualizar(mid, (m) => ({
        ...m,
        error: true,
        hora: horaActual(),
        texto: "Algo falló de nuestro lado. Intenta de nuevo en un momento.",
      }))
    } finally {
      setOcupado(false)
    }
  }

  // Si una pregunta fue a la redacción, se consulta cada 10 s mientras la pestaña siga abierta.
  const esperando = mensajes
    .filter((m) => m.fin?.estado === "derivada")
    .map((m) => m.fin!.consulta_id)
    .filter((cid) => !mensajes.some((m) => m.deRedaccion && m.id === `redaccion-${cid}`))
  const clave = esperando.join(",")
  useEffect(() => {
    if (!clave) return
    const ids = clave.split(",").map(Number)
    const t = setInterval(async () => {
      for (const cid of ids) {
        const r = await api.respuestaRedaccion(cid).catch(() => null)
        if (r?.respuesta) {
          setMensajes((ms) =>
            ms.some((m) => m.id === `redaccion-${cid}`)
              ? ms
              : [...ms, { id: `redaccion-${cid}`, rol: "asistente", texto: r.respuesta!, deRedaccion: true, hora: horaActual() }],
          )
        }
      }
    }, 10000)
    return () => clearInterval(t)
  }, [clave])

  if (variante === "whatsapp") {
    return (
      <WhatsApp
        mensajes={mensajes}
        texto={texto}
        setTexto={setTexto}
        ocupado={ocupado}
        enviar={enviar}
        nuevaConversacion={nuevaConversacion}
        lista={lista}
        className={className}
      />
    )
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <header className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: "var(--fc-degradado)" }}>
        <img src="/marca/isologo-circulo-blanco.svg" alt="" className="size-9" />
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-bold">{medio}</h1>
        </div>
        {mensajes.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={nuevaConversacion}
            disabled={ocupado}
            className="ml-auto shrink-0 text-white hover:bg-white/15 hover:text-white"
          >
            <SquarePen /> <span className="hidden sm:inline">Nueva conversación</span>
          </Button>
        )}
      </header>

      <div ref={lista} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {mensajes.length === 0 && <Bienvenida onElegir={enviar} />}
          <AnimatePresence initial={false}>
            {mensajes.map((m) => (
              <motion.div
                key={m.id}
                layout="position"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={cn("flex", m.rol === "persona" ? "justify-end" : "justify-start")}
              >
                {m.rol === "persona" ? (
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] text-primary-foreground">
                    {m.texto}
                  </div>
                ) : (
                  <Respuesta mensaje={m} detalles={detalles} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <form
        className="border-t bg-card px-4 pt-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          enviar(texto)
        }}
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                enviar(texto)
              }
            }}
            placeholder="Escribe tu pregunta o el rumor que viste…"
            rows={1}
            maxLength={2000}
            className="max-h-32 min-h-11 resize-none rounded-xl text-[15px]"
          />
          <Button type="submit" size="icon-lg" disabled={ocupado || texto.trim().length < 2} className="size-11 rounded-xl" aria-label="Enviar">
            {ocupado ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
        <p className="mx-auto mt-2 flex max-w-2xl items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="size-3" /> Tu conversación se borra a los {plazo} sin mensajes, o antes si escribes «borrar». No compartas datos personales.
        </p>
      </form>
    </div>
  )
}

function Bienvenida({ onElegir }: { onElegir: (s: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
          <MessageCircleQuestion className="size-6" />
        </div>
        <h2 className="text-xl font-bold">¿Viste algo y no sabes si es cierto?</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Pregúntame. Si la redacción ya lo verificó, te respondo con la nota. Si no, se lo paso a una persona.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {SUGERENCIAS.map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.07 }}
            whileHover={{ x: 3 }}
            onClick={() => onElegir(s)}
            className="rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-secondary"
          >
            {s}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

function Respuesta({ mensaje: m, detalles }: { mensaje: Mensaje; detalles: boolean }) {
  if (m.deRedaccion) {
    return (
      <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-primary/30 bg-secondary px-4 py-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-primary">
          <Newspaper className="size-3.5" /> Te respondió la redacción
        </p>
        <p className="text-[15px] leading-relaxed whitespace-pre-line">{m.texto}</p>
      </div>
    )
  }

  if (m.sistema) {
    return (
      <div className="max-w-[90%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-[15px] leading-relaxed text-muted-foreground">
        {m.texto}
      </div>
    )
  }

  const enCurso = !m.fin && !m.error
  return (
    <div className="flex max-w-[90%] flex-col gap-2">
      <AnimatePresence mode="wait">
        {enCurso ? (
          <motion.div key="pasos" exit={{ opacity: 0, height: 0 }} className="rounded-2xl rounded-bl-md border bg-card px-4 py-3">
            <Pasos hechos={m.pasos ?? []} />
          </motion.div>
        ) : (
          <motion.div
            key="texto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              "rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-[15px] leading-relaxed",
              m.error && "border-destructive/30 text-destructive",
            )}
          >
            <TextoConCitas texto={m.texto ?? ""} fuentes={m.fin?.fuentes ?? []} />
          </motion.div>
        )}
      </AnimatePresence>

      {m.fin?.estado === "respondida" && m.fin.fuentes.length > 0 && <Fuentes fuentes={m.fin.fuentes} />}
      {m.fin?.estado === "derivada" && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2 self-start rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
          </span>
          <Inbox className="size-3.5" /> En la bandeja de la redacción. Si responden, lo verás aquí.
        </motion.div>
      )}
      {detalles && m.etiquetas && <Detalles etiquetas={m.etiquetas} fin={m.fin} />}
    </div>
  )
}

function Pasos({ hechos }: { hechos: Paso[] }) {
  const actual = hechos.at(-1)
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {PASOS.filter((p) => hechos.includes(p.paso) || p.paso === "clasificar").map((p) => {
        const listo = p.paso !== actual && hechos.includes(p.paso)
        return (
          <motion.li
            key={p.paso}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn("flex items-center gap-2", listo ? "text-muted-foreground" : "text-foreground")}
          >
            <span className="grid size-4 place-items-center">
              {listo ? (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                  <Check className="size-4 text-primary" />
                </motion.span>
              ) : (
                <Loader2 className="size-4 animate-spin text-primary" />
              )}
            </span>
            {p.texto}
          </motion.li>
        )
      })}
    </ul>
  )
}

/** Reemplaza [1] o [1, 2] por chips que llevan a la nota citada. */
function TextoConCitas({ texto, fuentes }: { texto: string; fuentes: Fuente[] }) {
  const partes = texto.split(/(\[[\d,\s]+\])/g)
  return (
    <p className="whitespace-pre-line">
      {partes.map((parte, i) => {
        const nums = parte.match(/^\[([\d,\s]+)\]$/)?.[1].match(/\d+/g)
        if (!nums) return <span key={i}>{parte}</span>
        return nums.map((n) => {
          const f = fuentes.find((x) => x.n === Number(n)) ?? fuentes[0]
          return (
            <a
              key={`${i}-${n}`}
              href={enlace(f?.url)}
              target="_blank"
              rel="noreferrer"
              title={f?.titulo}
              className="mx-0.5 inline-grid h-4 min-w-4 -translate-y-0.5 place-items-center rounded bg-secondary px-1 align-middle text-[10px] font-bold text-primary no-underline hover:bg-primary hover:text-primary-foreground"
            >
              {n}
            </a>
          )
        })
      })}
    </p>
  )
}

function Fuentes({ fuentes }: { fuentes: Fuente[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {fuentes.map((f, i) => (
        <motion.a
          key={f.url}
          href={enlace(f.url)}
          target="_blank"
          rel="noreferrer"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.08 }}
          className="group flex items-start gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-primary/40"
        >
          <span className="mt-0.5 h-8 w-1 shrink-0 rounded-full bg-primary/70" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-bold group-hover:text-primary">{f.titulo}</span>
            <span className="text-xs text-muted-foreground">
              {etiquetaSeccion(f.seccion)} · {new Date(f.fecha + "T12:00").toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </span>
          <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
        </motion.a>
      ))}
    </div>
  )
}

function Detalles({ etiquetas: e, fin }: { etiquetas: Etiquetas; fin?: Fin }) {
  const chips = [
    `${etiqueta(e.tipo)} ${Math.round(e.tipo_conf * 100)}%`,
    ...e.temas.map(etiqueta),
    e.lugar && `lugar: ${e.lugar}`,
    fin?.similitud != null && `similitud ${fin.similitud.toFixed(2)}`,
    fin?.contesta != null && `contesta ${fin.contesta.toFixed(2)}`,
    fin?.hechos != null && `afirma hechos ${fin.hechos.toFixed(2)}`,
    fin?.respaldo != null && `respaldo ${fin.respaldo.toFixed(2)}`,
    fin && `→ ${fin.estado}: ${etiqueta(fin.motivo)}`,
  ].filter(Boolean) as string[]
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {c}
        </span>
      ))}
    </div>
  )
}
