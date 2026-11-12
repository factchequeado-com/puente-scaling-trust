import { useState, type ComponentType, type SVGProps } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  CircleCheck,
  Globe,
  Inbox,
  MessageCircle,
  Newspaper,
  PenLine,
  RefreshCw,
  Scale,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react"

import { Chat } from "@/components/chat/Chat"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Icono = ComponentType<SVGProps<SVGSVGElement>>
type Vista = "web" | "whatsapp"

const VISTAS: { vista: Vista; texto: string; icono: Icono; color: string }[] = [
  { vista: "web", texto: "En la web", icono: Globe, color: "bg-primary" },
  { vista: "whatsapp", texto: "En WhatsApp", icono: MessageCircle, color: "bg-[#00a884]" },
]

const BENEFICIOS: { icono: Icono; titulo: string; texto: string }[] = [
  {
    icono: Users,
    titulo: "Menos carga para tu equipo",
    texto:
      "Las preguntas que se repiten se responden solas, con las notas que tu medio ya publicó. El equipo atiende lo nuevo y lo sensible, en vez de contestar lo mismo todo el día.",
  },
  {
    icono: ShieldCheck,
    titulo: "Solo responde lo que está publicado",
    texto:
      "Cada respuesta cita la nota en la que se apoya, y un segundo modelo revisa que esté respaldada antes de enviarla. Si no lo está, no sale.",
  },
  {
    icono: Inbox,
    titulo: "La redacción, siempre en el circuito",
    texto:
      "Lo que no puede responder llega a una bandeja con la conversación completa. La respuesta de la redacción vuelve a la persona y se suma a la base.",
  },
  {
    icono: Server,
    titulo: "Costo bajo y datos de la red",
    texto:
      "Modelos abiertos que corren en servidores de la red, sin pagar por cada mensaje ni depender de proveedores comerciales de IA. Las conversaciones quedan del lado de los medios.",
  },
  {
    icono: BarChart3,
    titulo: "Escuchar a tu comunidad, con un kit abierto",
    texto:
      "Un panel muestra qué pregunta tu comunidad y qué queda sin respuesta: ideas para la próxima nota. Y es código abierto: cada medio lo usa con sus notas, en su propio WhatsApp.",
  },
]

const NOTAS: { icono: Icono; titulo: string; texto: string; proximo?: boolean }[] = [
  {
    icono: ShieldAlert,
    titulo: "Urgencias, sin improvisar",
    texto: "Si alguien está en riesgo, recibe un mensaje fijo y la consulta pasa directo a la bandeja.",
  },
  {
    icono: RefreshCw,
    titulo: "La base se actualiza sola",
    texto: "Las notas entran desde el sitio del medio. Nadie tiene que cargar reclamos ni imágenes a mano.",
  },
  {
    icono: Scale,
    titulo: "Auditoría de modelos comerciales",
    texto: "Las mismas preguntas se le hacen a ChatGPT, Perplexity o Meta AI, y se registra cuándo no citan o desinforman.",
    proximo: true,
  },
]

/** Página de demo: el chat como lo vería la audiencia (en la web o en WhatsApp), cómo funciona y qué le da a un medio. */
export function Inicio() {
  const [vista, setVista] = useState<Vista>(() =>
    new URLSearchParams(window.location.search).get("vista") === "whatsapp" ? "whatsapp" : "web",
  )

  return (
    <div className="min-h-svh">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_440px] lg:py-12">
        <div className="flex flex-col justify-center gap-6">
          <img src="/marca/factchequeado-logo-violeta.svg" alt="Factchequeado" className="h-8 w-fit" />
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl leading-tight font-bold text-balance lg:text-5xl">Conecta con tu comunidad</h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Un asistente para responder consultas de tu comunidad a partir del contenido ya publicado que además
              permite integrar a tu redacción en el proceso de ida y vuelta. Sacá ideas de notas, respondé consultas y
              fidelizá a tu comunidad.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="#como-funciona" className={buttonVariants({ size: "lg" })}>
              Cómo funciona <ArrowDown />
            </a>
            <Link to="/redaccion" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Ver la redacción <ArrowRight />
            </Link>
            <Link to="/chat" target="_blank" className={buttonVariants({ size: "lg", variant: "ghost" })}>
              Abrir el chat solo
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div role="tablist" aria-label="Dónde se ve el chat" className="mx-auto flex w-fit rounded-full border bg-card p-1 shadow-sm">
            {VISTAS.map((v) => {
              const activa = vista === v.vista
              return (
                <button
                  key={v.vista}
                  role="tab"
                  aria-selected={activa}
                  onClick={() => setVista(v.vista)}
                  className={cn(
                    "relative rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
                    activa ? "text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {activa && (
                    <motion.span
                      layoutId="vista-activa"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      className={cn("absolute inset-0 rounded-full", v.color)}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    <v.icono className="size-4" /> {v.texto}
                  </span>
                </button>
              )
            })}
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 24 }}
            className={cn(
              "h-[720px] max-h-[85svh]",
              vista === "web" && "overflow-hidden rounded-3xl border bg-card shadow-xl shadow-primary/10",
            )}
          >
            {/* El mismo Chat en las dos vistas: al cambiar, la conversación sigue. */}
            <Chat detalles={vista === "web"} variante={vista} />
          </motion.div>
        </div>
      </div>

      <section id="como-funciona" className="scroll-mt-6 border-t bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-14">
          <Encabezado
            antetitulo="Cómo funciona"
            titulo="Respuestas automáticas + soporte de la redacción"
            texto="El sistema responde automáticamente a las cosas para las que ya hay contenido. Para temas sensibles y consultas particulares, envía todo a la bandeja para que la redacción pueda responder de forma directa."
          />
          <Diagrama />
          <PasosMovil />
          <div className="grid gap-3 md:grid-cols-3">
            {NOTAS.map((n) => (
              <div key={n.titulo} className="flex gap-3 rounded-xl border bg-background p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <n.icono className="size-4.5" />
                </span>
                <span>
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    {n.titulo}
                    {n.proximo && (
                      <span className="rounded-full bg-fc-mostaza/20 px-2 py-0.5 text-[10px] tracking-wide text-amber-800 uppercase">
                        En la propuesta
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">{n.texto}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-14">
          <Encabezado
            antetitulo="Para los medios aliados"
            titulo="Qué gana tu medio"
            texto="Un asistente para la comunidad que ya tienes, sin perder el control editorial."
          />
          <ol className="grid gap-4 md:grid-cols-6">
            {BENEFICIOS.map((b, i) => (
              <motion.li
                key={b.titulo}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.07 }}
                className={cn(
                  "relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5",
                  i < 3 ? "md:col-span-2" : "md:col-span-3",
                )}
              >
                <span className="absolute -top-3 right-3 font-heading text-7xl font-bold text-secondary select-none">{i + 1}</span>
                <span className="relative grid size-10 place-items-center rounded-xl text-white" style={{ background: "var(--fc-degradado)" }}>
                  <b.icono className="size-5" />
                </span>
                <h3 className="relative text-lg leading-snug font-bold">{b.titulo}</h3>
                <p className="relative text-sm leading-relaxed text-muted-foreground">{b.texto}</p>
              </motion.li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6 text-white" style={{ background: "var(--fc-degradado)" }}>
            <p className="max-w-2xl text-lg font-bold">
              Buscamos de 3 a 5 medios con comunidades activas en WhatsApp para hacer las primeras pruebas.
            </p>
            <Link to="/redaccion" className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "text-primary")}>
              Ver qué ve la redacción <ArrowRight />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function Encabezado({ antetitulo, titulo, texto }: { antetitulo: string; titulo: string; texto: string }) {
  return (
    <div className="flex max-w-3xl flex-col gap-2">
      <p className="text-sm font-bold tracking-wide text-primary uppercase">{antetitulo}</p>
      <h2 className="text-3xl leading-tight font-bold text-balance">{titulo}</h2>
      <p className="text-muted-foreground">{texto}</p>
    </div>
  )
}

/* ---------- Diagrama del circuito ---------- */

type Tono = "normal" | "exito" | "redaccion" | "redaccionFin"
type NodoDef = { icono: Icono; titulo: string[]; tono: Tono }

const W = 192
const H = 76
const X = (i: number) => 8 + i * 228
const FILA_1 = 52
const FILA_2 = 212

const AUTOMATICO: NodoDef[] = [
  { icono: MessageCircle, titulo: ["La comunidad", "pregunta"], tono: "normal" },
  { icono: Search, titulo: ["Busca en lo", "publicado"], tono: "normal" },
  { icono: PenLine, titulo: ["Escribe la", "respuesta"], tono: "normal" },
  { icono: ShieldCheck, titulo: ["Revisa que esté", "respaldada"], tono: "normal" },
  { icono: CircleCheck, titulo: ["Responde con", "la nota"], tono: "exito" },
]

const BANDEJA: NodoDef = { icono: Inbox, titulo: ["Va a la bandeja"], tono: "redaccion" }
const RESPONDE: NodoDef = { icono: Newspaper, titulo: ["La redacción", "responde"], tono: "redaccionFin" }

const TONOS: Record<Tono, { caja: string; fondoIcono: string; icono: string; titulo: string }> = {
  normal: {
    caja: "fill-background stroke-border",
    fondoIcono: "fill-secondary",
    icono: "text-primary",
    titulo: "fill-foreground",
  },
  exito: {
    caja: "fill-primary stroke-primary",
    fondoIcono: "fill-white/15",
    icono: "text-white",
    titulo: "fill-primary-foreground",
  },
  redaccion: {
    caja: "fill-amber-50 stroke-amber-300 dark:fill-amber-950/40 dark:stroke-amber-700",
    fondoIcono: "fill-amber-100 dark:fill-amber-900/60",
    icono: "text-amber-700 dark:text-amber-300",
    titulo: "fill-amber-950 dark:fill-amber-100",
  },
  redaccionFin: {
    caja: "fill-amber-500 stroke-amber-500",
    fondoIcono: "fill-white/20",
    icono: "text-white",
    titulo: "fill-white",
  },
}

function Nodo({ nodo, x, y }: { nodo: NodoDef; x: number; y: number }) {
  const t = TONOS[nodo.tono]
  const primera = y + H / 2 + 5 - (nodo.titulo.length - 1) * 9
  return (
    <g>
      <rect x={x} y={y} width={W} height={H} rx={16} strokeWidth={1.5} className={t.caja} />
      <rect x={x + 14} y={y + H / 2 - 16} width={32} height={32} rx={9} className={t.fondoIcono} />
      <nodo.icono x={x + 21} y={y + H / 2 - 9} width={18} height={18} className={t.icono} />
      {nodo.titulo.map((l, i) => (
        <text key={l} x={x + 58} y={primera + i * 18} className={cn("text-[15px] font-bold", t.titulo)}>
          {l}
        </text>
      ))}
    </g>
  )
}

function Flecha({ d, tono = "primary" }: { d: string; tono?: "primary" | "amber" }) {
  return (
    <path
      d={d}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      markerEnd={`url(#punta-${tono})`}
      className={cn("flujo", tono === "primary" ? "stroke-primary/60" : "stroke-amber-500")}
    />
  )
}

function Etiqueta({ x, y, texto, anchor = "start" }: { x: number; y: number; texto: string; anchor?: "start" | "middle" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className="fill-muted-foreground text-[13px] italic">
      {texto}
    </text>
  )
}

/** Las dos formas de terminar (respuesta automática o de la redacción) quedan en la misma columna. */
function Diagrama() {
  const medio = FILA_1 + H / 2
  const centro = (i: number) => X(i) + W / 2
  const fondo = FILA_2 + H + 30
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      className="hidden rounded-2xl border bg-background p-4 md:block lg:p-6"
    >
      <svg viewBox="0 0 1120 330" className="h-auto w-full font-sans" role="img" aria-label="Diagrama del circuito de cada mensaje">
        <defs>
          {(["primary", "amber"] as const).map((t) => (
            <marker key={t} id={`punta-${t}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className={t === "primary" ? "fill-primary/70" : "fill-amber-500"} />
            </marker>
          ))}
        </defs>

        {/* Columna final: la persona recibe la respuesta, sea automática o de la redacción */}
        <rect x={X(4) - 12} y={8} width={W + 24} height={FILA_2 + H + 12 - 8} rx={20} strokeDasharray="5 5" strokeWidth={1.5} className="fill-secondary/40 stroke-primary/25" />
        <text x={centro(4)} y={34} textAnchor="middle" className="fill-primary text-[12px] font-bold tracking-[0.1em]">
          LA PERSONA RECIBE
        </text>

        {AUTOMATICO.slice(0, -1).map((_, i) => (
          <Flecha key={i} d={`M${X(i) + W + 4} ${medio} H${X(i + 1) - 6}`} />
        ))}
        <Etiqueta x={X(4) - 30} y={medio - 10} texto="sí" anchor="middle" />

        <Flecha d={`M${centro(3)} ${FILA_1 + H + 4} V${FILA_2 - 6}`} tono="amber" />
        <Etiqueta x={centro(3) + 12} y={(FILA_1 + H + FILA_2) / 2 + 5} texto="sin respaldo o sensible" />
        <Flecha d={`M${X(3) + W + 4} ${FILA_2 + H / 2} H${X(4) - 6}`} tono="amber" />

        <Flecha d={`M${centro(4)} ${FILA_2 + H + 4} V${fondo} H${centro(1)} V${FILA_1 + H + 6}`} tono="amber" />
        <Etiqueta x={centro(2)} y={fondo - 8} texto="se suma a la base" anchor="middle" />

        {AUTOMATICO.map((n, i) => (
          <Nodo key={n.titulo.join(" ")} nodo={n} x={X(i)} y={FILA_1} />
        ))}
        <Nodo nodo={BANDEJA} x={X(3)} y={FILA_2} />
        <Nodo nodo={RESPONDE} x={X(4)} y={FILA_2} />
      </svg>
    </motion.div>
  )
}

/** En pantallas chicas el diagrama se lee como lista. */
function PasosMovil() {
  return (
    <ol className="flex flex-col gap-2 md:hidden">
      {[...AUTOMATICO, BANDEJA, RESPONDE].map((n, i) => {
        const t = TONOS[n.tono]
        return (
          <li key={n.titulo.join(" ")} className="flex flex-col gap-2">
            {i === 5 && <p className="pt-2 text-xs font-bold tracking-wide text-amber-700 uppercase">Sin respaldo o sensible</p>}
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 font-bold",
                n.tono === "exito" && "border-primary bg-primary text-primary-foreground",
                n.tono === "redaccion" && "border-amber-300 bg-amber-50 text-amber-950",
                n.tono === "redaccionFin" && "border-amber-500 bg-amber-500 text-white",
                n.tono === "normal" && "bg-background",
              )}
            >
              <n.icono className={cn("size-5 shrink-0", t.icono)} />
              {n.titulo.join(" ")}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
