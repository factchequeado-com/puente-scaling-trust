import { useEffect, useState } from "react"
import { CheckCircle2, CircleDashed, Plus, Save, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { api, etiqueta, type Ajustes as DatosAjustes, type AjustesCompletos, type Nivel } from "@/lib/api"
import { cn } from "@/lib/utils"

const NIVELES: { nivel: Nivel; texto: string; ayuda: string }[] = [
  { nivel: "normal", texto: "Automático", ayuda: "Responde si la revisión de d1 da bien" },
  { nivel: "exigente", texto: "Exigente", ayuda: "Responde solo si d1 está muy seguro" },
  { nivel: "redaccion", texto: "Siempre la redacción", ayuda: "No responde: pasa a una persona" },
]

/** Lo que cada medio ajusta sin tocar código. Solo un admin guarda; el resto lo ve. */
export function Ajustes({ esAdmin }: { esAdmin: boolean }) {
  const [datos, setDatos] = useState<AjustesCompletos | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    api.ajustes().then(setDatos).catch(() => toast.error("No se pudieron leer los ajustes"))
  }, [])

  if (!datos) return null
  const cambiar = (cambio: Partial<DatosAjustes>) => setDatos({ ...datos, ...cambio })

  async function guardar() {
    if (!datos) return
    setGuardando(true)
    try {
      const { nombre_medio, rss_url, ficha, mensaje_urgencia, mensaje_derivada, niveles, avisos_cuando, avisos_emails } = datos
      await api.guardarAjustes({
        avisos_cuando,
        avisos_emails,
        nombre_medio,
        rss_url,
        ficha: ficha.filter((p) => p.pregunta.trim() && p.respuesta.trim()),
        mensaje_urgencia,
        mensaje_derivada,
        niveles,
      })
      toast.success("Ajustes guardados: valen desde el próximo mensaje")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar")
    } finally {
      setGuardando(false)
    }
  }

  async function probarAvisos() {
    try {
      const r = await api.probarAvisos()
      const texto = Object.entries(r)
        .map(([canal, estado]) => `${canal === "slack" ? "Slack" : "Email"}: ${estado}`)
        .join(" · ")
      if (Object.values(r).some((e) => e.startsWith("error"))) toast.error(texto)
      else toast.success(texto)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo probar")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!esAdmin && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Solo un admin puede cambiar los ajustes.</p>
      )}

      <Seccion titulo="El medio" ayuda="El nombre aparece en el chat y en los mensajes. El RSS es de donde salen las notas.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <Input value={datos.nombre_medio} disabled={!esAdmin} onChange={(e) => cambiar({ nombre_medio: e.target.value })} />
          </Campo>
          <Campo etiqueta="RSS de las notas">
            <Input value={datos.rss_url} disabled={!esAdmin} onChange={(e) => cambiar({ rss_url: e.target.value })} />
          </Campo>
        </div>
      </Seccion>

      <Seccion
        titulo="Qué es este servicio"
        ayuda="Lo que el asistente sabe de sí mismo. Le llega en cada turno como una nota más: con esto se presenta y explica qué es, quién está detrás y qué pasa con los datos. {medio} se reemplaza por el nombre y {plazo}, por cuánto dura una conversación."
      >
        <div className="flex flex-col gap-2">
          {datos.ficha.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto]">
              <Input
                value={p.pregunta}
                disabled={!esAdmin}
                placeholder="Pregunta"
                onChange={(e) => cambiar({ ficha: datos.ficha.map((x, j) => (j === i ? { ...x, pregunta: e.target.value } : x)) })}
              />
              <Textarea
                value={p.respuesta}
                disabled={!esAdmin}
                placeholder="Respuesta"
                rows={2}
                className="min-h-0"
                onChange={(e) => cambiar({ ficha: datos.ficha.map((x, j) => (j === i ? { ...x, respuesta: e.target.value } : x)) })}
              />
              {esAdmin && (
                <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => cambiar({ ficha: datos.ficha.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {esAdmin && (
            <Button variant="outline" size="sm" className="self-start" onClick={() => cambiar({ ficha: [...datos.ficha, { pregunta: "", respuesta: "" }] })}>
              <Plus /> Agregar una pregunta
            </Button>
          )}
        </div>
      </Seccion>

      <Seccion
        titulo="Cuánto responde solo, por tema"
        ayuda="Cada mensaje se clasifica por tema. Si toca varios, vale el más estricto. Las urgencias van siempre a la redacción."
      >
        <div className="flex flex-col divide-y">
          {Object.entries(datos.temas).map(([tema, descripcion]) => {
            const actual = datos.niveles[tema] ?? "normal"
            return (
              <div key={tema} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{etiqueta(tema)}</p>
                  <p className="text-xs text-muted-foreground">{descripcion}</p>
                </div>
                <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1">
                  {NIVELES.map((n) => (
                    <button
                      key={n.nivel}
                      type="button"
                      title={n.ayuda}
                      disabled={!esAdmin}
                      onClick={() => cambiar({ niveles: { ...datos.niveles, [tema]: n.nivel } })}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs transition-colors disabled:cursor-default",
                        actual === n.nivel ? "bg-card font-bold text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {n.texto}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Seccion>

      <Seccion titulo="Mensajes fijos" ayuda="Los escribe la redacción: el asistente no los improvisa. {medio} se reemplaza por el nombre y {plazo}, por cuánto dura una conversación.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Cuando un mensaje parece urgente">
            <Textarea value={datos.mensaje_urgencia} disabled={!esAdmin} rows={4} onChange={(e) => cambiar({ mensaje_urgencia: e.target.value })} />
          </Campo>
          <Campo etiqueta="Cuando la pregunta pasa a la redacción">
            <Textarea value={datos.mensaje_derivada} disabled={!esAdmin} rows={4} onChange={(e) => cambiar({ mensaje_derivada: e.target.value })} />
          </Campo>
        </div>
      </Seccion>

      <Seccion
        titulo="Avisos a la redacción"
        ayuda="Cuando una consulta llega a la bandeja, se avisa por Slack (al canal del webhook) y por email. El aviso trae la pregunta sin datos personales, el motivo, el borrador y las notas. Slack y el servidor de correo se configuran en el servidor (ver docs/notifications.md)."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Avisar de</span>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ["todas", "Todo lo que llega a la bandeja"],
                  ["urgencias", "Solo urgencias"],
                  ["nunca", "Nada"],
                ] as const
              ).map(([valor, texto]) => (
                <button
                  key={valor}
                  type="button"
                  disabled={!esAdmin}
                  onClick={() => cambiar({ avisos_cuando: valor })}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors disabled:cursor-default",
                    datos.avisos_cuando === valor ? "bg-card font-bold text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
          </div>
          <Campo etiqueta="Correos que reciben el aviso (uno por línea)">
            <Textarea
              value={datos.avisos_emails.join("\n")}
              disabled={!esAdmin}
              rows={3}
              placeholder="redaccion@mimedio.org"
              onChange={(e) => cambiar({ avisos_emails: e.target.value.split("\n") })}
            />
          </Campo>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["slack", "Slack"],
                ["email", "Servidor de correo"],
              ] as const
            ).map(([clave, nombre]) => (
              <span key={clave} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
                {datos.avisos[clave] ? <CheckCircle2 className="size-4 text-primary" /> : <CircleDashed className="size-4 text-muted-foreground" />}
                {nombre}
              </span>
            ))}
            {esAdmin && (
              <Button variant="outline" size="sm" onClick={probarAvisos}>
                <Send /> Mandar un aviso de prueba
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">La prueba usa lo que está guardado: guarda los cambios antes de probar.</p>
        </div>
      </Seccion>

      <Seccion titulo="Canales" ayuda="Se conectan con variables del servidor (ver docs/channels.md). Sin token, los mensajes de salida quedan en el log.">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["whatsapp", "WhatsApp"],
              ["messenger", "Messenger"],
              ["instagram", "Instagram"],
              ["webhook_verificado", "Token de verificación del webhook"],
              ["firma", "Secreto de la app (firma)"],
            ] as const
          ).map(([clave, nombre]) => (
            <span key={clave} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
              {datos.canales[clave] ? <CheckCircle2 className="size-4 text-primary" /> : <CircleDashed className="size-4 text-muted-foreground" />}
              {nombre}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
            <CheckCircle2 className="size-4 text-primary" /> Chat web (/chat)
          </span>
        </div>
      </Seccion>

      {esAdmin && (
        <Button onClick={guardar} disabled={guardando} className="sticky bottom-4 self-end shadow-lg">
          <Save /> Guardar ajustes
        </Button>
      )}
    </div>
  )
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3 p-4">
      <div>
        <h2 className="font-heading text-base font-bold">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{ayuda}</p>
      </div>
      {children}
    </Card>
  )
}

function Campo({ etiqueta: texto, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {texto}
      {children}
    </label>
  )
}
