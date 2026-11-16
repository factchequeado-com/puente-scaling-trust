import type { ReactNode, RefObject } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowLeft,
  BadgeCheck,
  BatteryFull,
  Camera,
  CheckCheck,
  Inbox,
  Lock,
  Mic,
  Paperclip,
  Phone,
  RotateCcw,
  SendHorizontal,
  Signal,
  Smile,
  Video,
  Wifi,
} from "lucide-react"

import { enlace, horaActual, SUGERENCIAS, type Mensaje } from "@/components/chat/comun"
import { etiquetaSeccion, type Fuente } from "@/lib/api"
import { cn } from "@/lib/utils"

/** La misma conversación, dibujada como un chat de WhatsApp dentro de un teléfono. Es una maqueta: no pasa por WhatsApp. */
export function WhatsApp({
  mensajes,
  texto,
  setTexto,
  ocupado,
  enviar,
  nuevaConversacion,
  lista,
  className,
}: {
  mensajes: Mensaje[]
  texto: string
  setTexto: (t: string) => void
  ocupado: boolean
  enviar: (t: string) => void
  nuevaConversacion: () => void
  lista: RefObject<HTMLDivElement | null>
  className?: string
}) {
  const hayTexto = texto.trim().length >= 2
  return (
    <div className={cn("flex h-full justify-center", className)}>
      <div className="flex h-full w-full max-w-[390px] flex-col overflow-hidden rounded-[2.75rem] border-[10px] border-neutral-900 bg-[#f0f2f5] shadow-2xl shadow-black/25">
        {/* Barra de estado del teléfono */}
        <div className="flex items-center justify-between bg-[#008069] px-6 pt-2 pb-1 text-[12px] font-bold text-white">
          <span>{horaActual()}</span>
          <span className="flex items-center gap-1">
            <Signal className="size-3.5" />
            <Wifi className="size-3.5" />
            <BatteryFull className="size-4" />
          </span>
        </div>

        <header className="flex items-center gap-2 bg-[#008069] py-2 pr-2 pl-1.5 text-white">
          <ArrowLeft className="size-5 shrink-0" />
          <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: "var(--fc-degradado)" }}>
            <img src="/marca/isologo-circulo-blanco.svg" alt="" className="size-7" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="flex items-center gap-1 text-[16px] font-bold">
              Factchequeado <BadgeCheck className="size-4 shrink-0 fill-[#25d366] text-[#008069]" />
            </p>
            <p className="truncate text-[12px] text-white/85">{ocupado ? "escribiendo…" : "Cuenta de empresa"}</p>
          </div>
          <Video className="mx-1.5 size-5 shrink-0" />
          <Phone className="mx-1.5 size-[18px] shrink-0" />
          <button
            type="button"
            onClick={nuevaConversacion}
            disabled={ocupado || mensajes.length === 0}
            title="Nueva conversación"
            aria-label="Nueva conversación"
            className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/15 disabled:opacity-40"
          >
            <RotateCcw className="size-[18px]" />
          </button>
        </header>

        <div
          ref={lista}
          className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3"
          style={{
            backgroundColor: "#efeae2",
            backgroundImage: "radial-gradient(rgb(0 0 0 / 4.5%) 1px, transparent 1.2px)",
            backgroundSize: "16px 16px",
          }}
        >
          <Aviso className="bg-white/90 font-bold tracking-wide text-[#54656f] uppercase">Hoy</Aviso>
          <Aviso className="mb-1 bg-[#ffeecd] text-[#54656f]">
            <Lock className="mr-1 inline size-3 -translate-y-px" />
            Respuestas automáticas con lo que publicó la redacción. Lo que no se pueda responder lo lee una persona.
          </Aviso>

          {mensajes.length === 0 && <Bienvenida onElegir={enviar} />}

          <AnimatePresence initial={false}>
            {mensajes.map((m) => (
              <motion.div
                key={m.id}
                layout="position"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="flex flex-col gap-1.5"
              >
                <MensajeWA mensaje={m} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <form
          className="flex items-end gap-1.5 px-2 pt-2 pb-1"
          onSubmit={(e) => {
            e.preventDefault()
            enviar(texto)
          }}
        >
          <div className="flex min-h-11 flex-1 items-end gap-2 rounded-3xl bg-white px-3 py-2.5 shadow-[0_1px_0.5px_rgb(11_20_26/13%)]">
            <Smile className="size-6 shrink-0 text-[#54656f]" />
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  enviar(texto)
                }
              }}
              placeholder="Mensaje"
              rows={1}
              maxLength={2000}
              className="field-sizing-content max-h-24 min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-6 text-[#111b21] outline-none placeholder:text-[#667781]"
            />
            <Paperclip className="size-5 shrink-0 -rotate-45 text-[#54656f]" />
            {!texto && <Camera className="size-5 shrink-0 text-[#54656f]" />}
          </div>
          <button
            type="submit"
            disabled={ocupado && hayTexto}
            aria-label="Enviar"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white transition-transform active:scale-95 disabled:opacity-60"
          >
            {hayTexto ? <SendHorizontal className="size-5" /> : <Mic className="size-5" />}
          </button>
        </form>
        <div className="flex justify-center pt-1 pb-2">
          <span className="h-1 w-28 rounded-full bg-neutral-900/80" />
        </div>
      </div>
    </div>
  )
}

function Aviso({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mx-auto max-w-[88%] rounded-lg px-3 py-1.5 text-center text-[12px] leading-snug shadow-[0_1px_0.5px_rgb(11_20_26/13%)]",
        className,
      )}
    >
      {children}
    </p>
  )
}

/** Burbuja con la "cola" de WhatsApp; la hora va abajo a la derecha, con un espacio reservado al final del texto. */
function Burbuja({
  saliente = false,
  hora,
  children,
  className,
}: {
  saliente?: boolean
  hora?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative max-w-[85%] rounded-lg px-2 pt-1.5 pb-2 text-[14.5px] leading-[20px] text-[#111b21] shadow-[0_1px_0.5px_rgb(11_20_26/13%)]",
        saliente ? "self-end rounded-tr-none bg-[#d9fdd3]" : "self-start rounded-tl-none bg-white",
        className,
      )}
    >
      <svg
        viewBox="0 0 8 13"
        width="8"
        height="13"
        aria-hidden
        className={cn("absolute top-0", saliente ? "-right-2 fill-[#d9fdd3]" : "-left-2 fill-white")}
      >
        {saliente ? (
          <path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z" />
        ) : (
          <path d="M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z" />
        )}
      </svg>
      {children}
      {(hora || saliente) && <span className={cn("inline-block", saliente ? "w-[66px]" : "w-11")} />}
      <span className="absolute right-2 bottom-1 flex items-center gap-0.5 text-[11px] text-[#667781]">
        {hora}
        {saliente && <CheckCheck className="size-4 text-[#53bdeb]" />}
      </span>
    </div>
  )
}

function Bienvenida({ onElegir }: { onElegir: (s: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex max-w-[85%] flex-col gap-0.5 self-start">
      <Burbuja hora={horaActual()} className="max-w-full">
        <span className="whitespace-pre-line">
          {"¡Hola! 👋 Soy el asistente de *Factchequeado*.\n\n¿Viste algo y no sabes si es cierto? Mándamelo. Si la redacción ya lo verificó, te respondo con la nota. Si no, se lo paso a una persona."
            .split("*")
            .map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}
        </span>
      </Burbuja>
      {SUGERENCIAS.map((s, i) => (
        <motion.button
          key={s}
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.07 }}
          onClick={() => onElegir(s)}
          className="rounded-lg bg-white px-3 py-2 text-center text-[13.5px] leading-snug text-[#027eb5] shadow-[0_1px_0.5px_rgb(11_20_26/13%)] transition-colors hover:bg-[#f5f6f6]"
        >
          {s}
        </motion.button>
      ))}
    </motion.div>
  )
}

function MensajeWA({ mensaje: m }: { mensaje: Mensaje }) {
  if (m.rol === "persona") {
    return (
      <Burbuja saliente hora={m.hora}>
        <span className="whitespace-pre-line">{m.texto}</span>
      </Burbuja>
    )
  }

  if (m.deRedaccion) {
    return (
      <Burbuja hora={m.hora}>
        <span className="mb-0.5 block text-[13px] font-bold text-[#67057c]">Redacción de Factchequeado</span>
        <span className="whitespace-pre-line">{m.texto}</span>
      </Burbuja>
    )
  }

  if (m.sistema) {
    return (
      <Burbuja hora={m.hora}>
        <span className="whitespace-pre-line">{m.texto}</span>
      </Burbuja>
    )
  }

  if (!m.fin && !m.error) return <Escribiendo />

  const fuentes = m.fin?.estado === "respondida" ? (m.fin.fuentes ?? []) : []
  return (
    <>
      <Burbuja hora={m.hora} className={cn(fuentes.length > 0 && "min-w-[75%]")}>
        {fuentes[0] && <Vista fuente={fuentes[0]} />}
        <span className={cn("whitespace-pre-line", m.error && "text-[#c8102e]")}>
          <TextoWA texto={m.texto ?? ""} fuentes={fuentes} />
        </span>
        {fuentes.length > 0 && (
          <span className="mt-1.5 block text-[13.5px] leading-snug">
            {fuentes.map((f) => (
              <a key={f.url} href={enlace(f.url)} target="_blank" rel="noreferrer" className="block truncate text-[#027eb5] hover:underline">
                [{f.n}] {f.titulo}
              </a>
            ))}
          </span>
        )}
      </Burbuja>
      {m.fin?.estado === "derivada" && (
        <Aviso className="bg-white/90 text-[#54656f]">
          <Inbox className="mr-1 inline size-3 -translate-y-px" />
          Consulta enviada a la redacción. Si responden, te llega por acá.
        </Aviso>
      )}
    </>
  )
}

/** La vista previa del link, como la arma WhatsApp con la primera nota citada. */
function Vista({ fuente: f }: { fuente: Fuente }) {
  const dominio = enlace(f.url) ? new URL(f.url).hostname.replace(/^www\./, "") : "factchequeado.com"
  return (
    <a
      href={enlace(f.url)}
      target="_blank"
      rel="noreferrer"
      className="-mx-1 mb-1.5 flex overflow-hidden rounded-md bg-[#f5f6f6] no-underline hover:bg-[#eef0f1]"
    >
      <span className="w-1 shrink-0 bg-[#67057c]" />
      <span className="flex min-w-0 flex-1 gap-2 p-2">
        <span className="grid size-11 shrink-0 place-items-center rounded" style={{ background: "var(--fc-degradado)" }}>
          <img src="/marca/isologo-circulo-blanco.svg" alt="" className="size-7" />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-[13px] leading-tight font-bold text-[#111b21]">{f.titulo}</span>
          <span className="mt-0.5 block truncate text-[12px] text-[#667781]">
            {etiquetaSeccion(f.seccion)} · {dominio}
          </span>
        </span>
      </span>
    </a>
  )
}

/** En WhatsApp no hay chips: las citas [1] quedan como texto, en el azul de los links. */
function TextoWA({ texto, fuentes }: { texto: string; fuentes: Fuente[] }) {
  return texto.split(/(\[[\d,\s]+\])/g).map((parte, i) => {
    if (!/^\[[\d,\s]+\]$/.test(parte)) return <span key={i}>{parte}</span>
    const n = Number(parte.match(/\d+/)?.[0])
    const f = fuentes.find((x) => x.n === n) ?? fuentes[0]
    return (
      <a key={i} href={enlace(f?.url)} target="_blank" rel="noreferrer" title={f?.titulo} className="text-[#027eb5] hover:underline">
        {parte}
      </a>
    )
  })
}

function Escribiendo() {
  return (
    <Burbuja className="pb-1.5">
      <span className="flex h-5 items-center gap-1 px-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-2 rounded-full bg-[#8696a0]"
            animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
    </Burbuja>
  )
}
