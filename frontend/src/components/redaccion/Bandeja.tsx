import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  ChevronDown,
  Copy,
  Lightbulb,
  Link2,
  MapPin,
  MessagesSquare,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api, etiqueta, hace, type Consulta, type LinkLeido, type Turno } from "@/lib/api"
import { cn } from "@/lib/utils"

/** Solo lo urgente lleva pastilla; la franja de la izquierda alcanza para el resto. */
const URGENCIA = {
  1: { texto: "", pastilla: "", borde: "bg-primary/20" },
  2: { texto: "Hoy", pastilla: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", borde: "bg-amber-400" },
  3: { texto: "Ahora", pastilla: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200", borde: "bg-red-500" },
} as const

/** Color del motivo por el que llegó a la bandeja. */
const MOTIVO: Record<string, string> = {
  sin_respaldo: "text-primary",
  sin_resultados: "text-primary",
  validacion: "text-fc-frambuesa",
  denuncia: "text-fc-azul dark:text-blue-300",
  urgencia: "text-red-700 dark:text-red-300",
}

/** Respuestas que se repiten. No afirman hechos, así que no se suman a la base. */
const PLANTILLAS = [
  {
    titulo: "Lo estamos verificando",
    texto: "¡Gracias por escribirnos! Todavía no tenemos una nota sobre esto. Lo estamos revisando con la redacción y te avisamos por acá.",
  },
  {
    titulo: "Pedir más datos",
    texto: "Gracias por escribir. ¿Nos cuentas dónde lo viste (link, captura o nombre de la cuenta) y cuándo? Así podemos revisarlo.",
  },
  {
    titulo: "Fuera de cobertura",
    texto: "Gracias por tu mensaje. Este tema está fuera de lo que cubrimos, así que no podemos darte una respuesta verificada.",
  },
]

type Vista = "pendientes" | "automaticas" | "redaccion" | "ideas"
type Orden = "urgencia" | "recientes"

const automatica = (c: Consulta) => c.estado === "respondida"

const VISTAS: { vista: Vista; texto: string; filtro: (c: Consulta) => boolean }[] = [
  { vista: "pendientes", texto: "Pendientes", filtro: (c) => !automatica(c) && !c.resuelta_en },
  { vista: "automaticas", texto: "Respondidas solas", filtro: automatica },
  { vista: "redaccion", texto: "Respondidas por la redacción", filtro: (c) => !automatica(c) && !!c.resuelta_en },
  { vista: "ideas", texto: "Ideas de nota", filtro: (c) => !!c.idea },
]

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

function textoBuscable(c: Consulta) {
  return normalizar(
    [c.texto, c.lugar, etiqueta(c.motivo), etiqueta(c.intencion), ...c.temas.map(etiqueta), ...c.hilo.map((t) => t.texto), c.respuesta, c.respuesta_redaccion]
      .filter(Boolean)
      .join(" "),
  )
}

export function Bandeja({ consultas, alCambiar }: { consultas: Consulta[]; alCambiar: () => void }) {
  const [vista, setVista] = useState<Vista>("pendientes")
  const [busqueda, setBusqueda] = useState("")
  const [temas, setTemas] = useState<Set<string>>(new Set())
  const [soloUrgentes, setSoloUrgentes] = useState(false)
  const [conBorrador, setConBorrador] = useState(false)
  const [orden, setOrden] = useState<Orden>("urgencia")
  // Descartar espera unos segundos para poder deshacer.
  const [descartando, setDescartando] = useState<Set<number>>(new Set())
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const visibles = consultas.filter((c) => !descartando.has(c.id))
  const deLaVista = visibles.filter(VISTAS.find((v) => v.vista === vista)!.filtro)

  const conteoTemas = useMemo(() => {
    const n = new Map<string, number>()
    for (const c of deLaVista) for (const t of c.temas) n.set(t, (n.get(t) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1])
  }, [deLaVista])

  const q = normalizar(busqueda.trim())
  const filtradas = deLaVista
    .filter((c) => !q || textoBuscable(c).includes(q))
    .filter((c) => !temas.size || c.temas.some((t) => temas.has(t)))
    .filter((c) => vista !== "pendientes" || !soloUrgentes || c.urgencia >= 2)
    .filter((c) => vista !== "pendientes" || !conBorrador || !!c.respuesta)
    .sort((a, b) =>
      orden === "urgencia" && a.urgencia !== b.urgencia ? b.urgencia - a.urgencia : b.creada.localeCompare(a.creada),
    )

  const hayFiltros = !!q || temas.size > 0 || (vista === "pendientes" && (soloUrgentes || conBorrador))
  const limpiar = () => {
    setBusqueda("")
    setTemas(new Set())
    setSoloUrgentes(false)
    setConBorrador(false)
  }

  function alternarTema(t: string) {
    setTemas((s) => {
      const n = new Set(s)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n
    })
  }

  function descartar(c: Consulta) {
    setDescartando((s) => new Set(s).add(c.id))
    const quitar = () =>
      setDescartando((s) => {
        const n = new Set(s)
        n.delete(c.id)
        return n
      })
    timers.current.set(
      c.id,
      setTimeout(async () => {
        timers.current.delete(c.id)
        await api.descartar(c.id).catch(() => toast.error("No se pudo descartar"))
        await alCambiar()
        quitar()
      }, 5000),
    )
    toast("Consulta descartada", {
      description: c.texto?.slice(0, 80),
      duration: 5000,
      action: {
        label: "Deshacer",
        onClick: () => {
          clearTimeout(timers.current.get(c.id))
          timers.current.delete(c.id)
          quitar()
        },
      },
    })
  }

  async function marcarIdea(c: Consulta) {
    const idea = !c.idea
    try {
      await api.idea(c.id, idea)
      toast.success(idea ? "Guardada en ideas de nota" : "Quitada de ideas de nota")
      alCambiar()
    } catch {
      toast.error("No se pudo guardar")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Nivel 1: qué lista estoy viendo */}
      <div className="flex items-end justify-between gap-3 border-b">
        <div className="flex gap-5">
          {VISTAS.map((v) => {
            const n = visibles.filter(v.filtro).length
            const activa = vista === v.vista
            return (
              <button
                key={v.vista}
                onClick={() => setVista(v.vista)}
                className={cn(
                  "relative flex items-center gap-1.5 pb-2.5 text-sm font-bold transition-colors",
                  activa ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.texto}
                <span className={cn("text-xs font-normal", activa ? "text-primary" : "text-muted-foreground")}>{n}</span>
                {activa && <motion.span layoutId="bandeja-vista" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setOrden(orden === "urgencia" ? "recientes" : "urgencia")}
          className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowDownUp className="size-3.5" />
          {orden === "urgencia" ? "Más urgentes primero" : "Más recientes primero"}
        </button>
      </div>

      {/* Nivel 2: buscar y filtrar dentro de esa lista */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="h-8 rounded-full bg-card pl-9"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {vista === "pendientes" && (
          <>
            <Filtro activo={soloUrgentes} onClick={() => setSoloUrgentes(!soloUrgentes)}>
              Urgentes
            </Filtro>
            <Filtro activo={conBorrador} onClick={() => setConBorrador(!conBorrador)}>
              Con borrador
            </Filtro>
          </>
        )}
        {conteoTemas.map(([t]) => (
          <Filtro key={t} activo={temas.has(t)} onClick={() => alternarTema(t)}>
            {etiqueta(t)}
          </Filtro>
        ))}
        {hayFiltros && (
          <button onClick={limpiar} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Limpiar
          </button>
        )}
      </div>

      {filtradas.length === 0 ? (
        <Vacia vista={vista} filtrando={hayFiltros} onLimpiar={limpiar} />
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {filtradas.map((c, i) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.03 } }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              >
                <Tarjeta consulta={c} alCambiar={alCambiar} onDescartar={() => descartar(c)} onIdea={() => marcarIdea(c)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function Filtro({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "flex h-8 items-center gap-1 rounded-full border px-3 text-xs transition-colors",
        activo
          ? "border-primary bg-primary font-bold text-primary-foreground"
          : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function Vacia({ vista, filtrando, onLimpiar }: { vista: Vista; filtrando: boolean; onLimpiar: () => void }) {
  const textos = {
    pendientes: ["La bandeja está al día", "Cuando el asistente no pueda responder algo, va a aparecer aquí."],
    automaticas: ["Todavía no respondió nada solo", "Lo que el asistente responda con las notas publicadas queda acá."],
    redaccion: ["Todavía no respondiste nada", "Lo que respondas desde la bandeja queda acá."],
    ideas: ["Todavía no hay ideas de nota", "Marca con la lamparita las consultas que podrían ser una nota."],
  }[vista]
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-2 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-secondary text-primary">
        {filtrando ? <Search className="size-7" /> : vista === "ideas" ? <Lightbulb className="size-7" /> : <CheckCircle2 className="size-7" />}
      </div>
      <h2 className="text-xl font-bold">{filtrando ? "Nada coincide con los filtros" : textos[0]}</h2>
      {filtrando ? (
        <Button variant="link" onClick={onLimpiar}>
          Limpiar filtros
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{textos[1]}</p>
      )}
    </motion.div>
  )
}

function Tarjeta({
  consulta: c,
  alCambiar,
  onDescartar,
  onIdea,
}: {
  consulta: Consulta
  alCambiar: () => void
  onDescartar: () => void
  onIdea: () => void
}) {
  const [abierta, setAbierta] = useState(c.urgencia >= 3 && !c.resuelta_en)
  const [respuesta, setRespuesta] = useState("")
  const [sumar, setSumar] = useState(true)
  // Una repregunta («¿y en Texas?») no se entiende sola: la redacción decide cómo queda en la base.
  const [pregunta, setPregunta] = useState(c.texto ?? "")
  const [enviando, setEnviando] = useState(false)
  const [foco, setFoco] = useState(0)
  const campo = useRef<HTMLTextAreaElement>(null)
  const urgencia = URGENCIA[(c.urgencia as 1 | 2 | 3) ?? 1] ?? URGENCIA[1]
  const auto = automatica(c)
  // Para la tarjeta, lo respondido solo también está resuelto: no se responde ni se descarta.
  const resuelta = auto || !!c.resuelta_en

  // Responder abre la tarjeta y lleva el cursor a la respuesta.
  useEffect(() => {
    if (!foco) return
    const t = setTimeout(() => campo.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [foco])

  function escribir(texto?: string, sumarABase?: boolean) {
    setAbierta(true)
    if (texto != null) setRespuesta(texto)
    if (sumarABase != null) setSumar(sumarABase)
    setFoco((n) => n + 1)
  }

  async function responder() {
    setEnviando(true)
    try {
      await api.responder(c.id, respuesta, sumar, c.hilo.length ? pregunta : undefined)
      toast.success(sumar ? "Respondida y sumada a la base" : "Respondida")
      alCambiar()
    } catch {
      toast.error("No se pudo guardar la respuesta")
      setEnviando(false)
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(c.texto ?? c.respuesta ?? "")
      toast.success("Consulta copiada")
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  const idea = (
    <Icono
      titulo={c.idea ? "Quitar de ideas de nota" : "Marcar como idea de nota"}
      onClick={onIdea}
      className={cn(c.idea && "text-fc-mostaza hover:text-amber-600")}
    >
      <Lightbulb className={cn(c.idea && "fill-fc-mostaza/40")} />
    </Icono>
  )

  return (
    <Card className={cn("group relative gap-0 overflow-hidden p-0 transition-shadow hover:shadow-md", abierta && "shadow-md")}>
      <span className={cn("absolute inset-y-0 left-0 w-1", auto ? "bg-primary" : resuelta ? "bg-emerald-500" : urgencia.borde)} />

      <div className="flex items-start gap-2 py-3 pr-3 pl-5">
        <button onClick={() => setAbierta(!abierta)} className="min-w-0 flex-1 py-0.5 text-left">
          <span className="flex items-start gap-2">
            {!resuelta && urgencia.texto && (
              <span className={cn("mt-px shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold", urgencia.pastilla)}>
                {c.urgencia >= 3 && <AlertTriangle className="-mt-0.5 mr-1 inline size-3" />}
                {urgencia.texto}
              </span>
            )}
            {auto ? (
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              resuelta && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            )}
            {c.texto ? (
              <span className="text-[15px] leading-snug font-bold">{c.texto}</span>
            ) : auto ? (
              // La pregunta se borró con la conversación: queda la respuesta.
              <span className="line-clamp-2 text-[15px] leading-snug text-muted-foreground">{c.respuesta}</span>
            ) : (
              <span className="text-[15px] leading-snug font-bold">(sin texto)</span>
            )}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {auto ? (
              <span className="font-bold text-primary">
                Respondida sola{c.fuentes.length > 0 && ` · ${c.fuentes.length} ${c.fuentes.length === 1 ? "nota" : "notas"}`}
              </span>
            ) : (
              <span className={cn("font-bold", MOTIVO[c.motivo] ?? "text-muted-foreground")}>{etiqueta(c.motivo)}</span>
            )}
            {c.temas.map((t) => (
              <span key={t}>· {etiqueta(t)}</span>
            ))}
            {c.lugar && (
              <span className="flex items-center gap-0.5">
                · <MapPin className="size-3" /> {c.lugar}
              </span>
            )}
            {c.hilo.length > 0 && (
              <span className="flex items-center gap-0.5" title="Mensajes de la conversación previa">
                · <MessagesSquare className="size-3" /> {c.hilo.length}
              </span>
            )}
            {c.links.length > 0 && (
              <span className="flex items-center gap-0.5" title="Compartió links">
                · <Link2 className="size-3" /> {c.links.length}
              </span>
            )}
            <span>· {hace(c.creada)}</span>
            {auto && !c.texto && <span className="italic">· la pregunta ya se borró</span>}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          {/* Las acciones aparecen al pasar el mouse; en pantallas táctiles quedan siempre visibles. */}
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            {!c.idea && idea}
            <Icono titulo="Copiar la consulta" onClick={copiar}>
              <Copy />
            </Icono>
            {!resuelta && (
              <Icono titulo="Descartar" onClick={onDescartar} className="hover:bg-destructive/10 hover:text-destructive">
                <Trash2 />
              </Icono>
            )}
            {!resuelta && !abierta && (
              <Button size="sm" variant="secondary" onClick={() => escribir()} className="ml-1">
                Responder
              </Button>
            )}
          </div>
          {!!c.idea && idea}
          <Icono titulo={abierta ? "Cerrar" : "Abrir"} onClick={() => setAbierta(!abierta)}>
            <motion.span animate={{ rotate: abierta ? 180 : 0 }} className="grid place-items-center">
              <ChevronDown />
            </motion.span>
          </Icono>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 border-t bg-muted/30 py-4 pr-4 pl-5">
              {c.hilo.length > 0 && <Hilo turnos={c.hilo} />}
              {c.links.length > 0 && <Links links={c.links} />}
              {auto ? (
                <Seccion
                  titulo={`Respuesta del asistente${c.respaldo != null ? ` · respaldo ${Math.round(c.respaldo * 100)}%` : ""}`}
                  className="text-primary"
                >
                  <p className="leading-relaxed whitespace-pre-line">{c.respuesta}</p>
                  {c.fuentes.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-1 border-l-2 border-primary/30 pl-3">
                      {c.fuentes.map((f) => (
                        <li key={f.url}>
                          <a
                            href={f.url.startsWith("http") ? f.url : undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            [{f.n}] {f.titulo}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </Seccion>
              ) : resuelta ? (
                c.respuesta_redaccion && (
                  <Seccion titulo={`Respuesta de la redacción · ${hace(c.resuelta_en!)}`} className="text-emerald-700 dark:text-emerald-300">
                    <p className="leading-relaxed whitespace-pre-line">{c.respuesta_redaccion}</p>
                  </Seccion>
                )
              ) : (
                <>
                  {c.respuesta && (
                    <Seccion
                      titulo="Borrador del asistente"
                      className="text-primary"
                      extra={
                        <Button variant="link" size="xs" className="h-auto p-0" onClick={() => escribir(c.respuesta!, true)}>
                          <Sparkles /> Usar como respuesta
                        </Button>
                      }
                    >
                      <p className="leading-relaxed text-muted-foreground">{c.respuesta}</p>
                    </Seccion>
                  )}

                  <div className="flex flex-col gap-2">
                    <Textarea
                      ref={campo}
                      value={respuesta}
                      onChange={(e) => setRespuesta(e.target.value)}
                      placeholder="Escribe la respuesta para esta persona…"
                      className="min-h-24 bg-card"
                    />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      Plantillas:
                      {PLANTILLAS.map((p) => (
                        <button key={p.titulo} onClick={() => escribir(p.texto, false)} className="text-primary hover:underline">
                          {p.titulo}
                        </button>
                      ))}
                    </div>
                  </div>

                  {sumar && c.hilo.length > 0 && (
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Así queda la pregunta en la base (que se entienda sin la conversación)
                      <Input value={pregunta} onChange={(e) => setPregunta(e.target.value)} maxLength={300} className="bg-card text-sm text-foreground" />
                    </label>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Switch checked={sumar} onCheckedChange={setSumar} />
                      Sumar a la base
                    </label>
                    <Button onClick={responder} disabled={respuesta.trim().length < 2 || enviando}>
                      <Send /> Responder
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function Icono({ titulo, onClick, className, children }: { titulo: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4",
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Un bloque del detalle: un título chico y su contenido, sin caja. */
function Seccion({
  titulo,
  extra,
  className,
  children,
}: {
  titulo: string
  extra?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-[11px] font-bold tracking-wide uppercase", className ?? "text-muted-foreground")}>{titulo}</p>
        {extra}
      </div>
      {children}
    </div>
  )
}

const QUIEN = { persona: "Persona", asistente: "Asistente", redaccion: "Redacción" } as const

/** Lo que se habló antes del mensaje derivado, para entenderlo en contexto. */
function Hilo({ turnos }: { turnos: Turno[] }) {
  return (
    <Seccion titulo="Conversación previa">
      <ol className="flex flex-col gap-1.5 border-l-2 pl-3">
        {turnos.map((t, i) => (
          <li key={i} className={cn("leading-snug", t.rol !== "persona" && "text-muted-foreground")}>
            <span className="font-bold">{QUIEN[t.rol]}:</span> {t.texto}
          </li>
        ))}
      </ol>
    </Seccion>
  )
}

/** Lo que se leyó de los links que compartió la persona: lo que circula, no verificado. */
function Links({ links }: { links: LinkLeido[] }) {
  return (
    <Seccion titulo="Lo que compartió (no verificado)">
      <ul className="flex flex-col gap-2 border-l-2 pl-3">
        {links.map((l) => (
          <li key={l.url} className="leading-snug">
            <a href={l.url} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
              {l.proveedor ?? l.dominio}
              {l.autor && <span className="font-normal text-muted-foreground"> · {l.autor}</span>}
            </a>
            {l.titulo || l.texto ? (
              <p className="text-muted-foreground">{[l.titulo, l.texto].filter(Boolean).join(" — ")}</p>
            ) : (
              <p className="text-muted-foreground italic">No se pudo leer el contenido</p>
            )}
          </li>
        ))}
      </ul>
    </Seccion>
  )
}
