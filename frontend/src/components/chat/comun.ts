import type { Etiquetas, Fin, Paso } from "@/lib/api"

/** Lo que comparten la vista web y la de WhatsApp. */
export type Mensaje = {
  id: string
  rol: "persona" | "asistente"
  texto?: string
  pasos?: Paso[]
  etiquetas?: Etiquetas
  fin?: Fin
  deRedaccion?: boolean
  /** Mensaje del sistema (la confirmación de «borrar»): no pasa por el circuito. */
  sistema?: boolean
  error?: boolean
  hora?: string
}

export const SUGERENCIAS = [
  "¿Es cierto que California manda 7 boletas a los votantes demócratas?",
  "¿Por qué cambian los resultados durante el conteo de votos?",
  "¿Qué pueden hacer los agentes de ICE durante un operativo?",
]

// Las respuestas de la redacción se guardan como redaccion://consulta/N: no son enlaces.
export const enlace = (url?: string) => (url?.startsWith("http") ? url : undefined)

export const horaActual = () => new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
