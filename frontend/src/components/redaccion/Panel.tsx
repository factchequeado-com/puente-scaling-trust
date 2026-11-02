import { useEffect } from "react"
import { animate, motion, useMotionValue, useTransform } from "motion/react"
import { ArrowDownRight, ArrowUpRight, MapPin } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { etiqueta, type Panel as DatosPanel } from "@/lib/api"

const COLORES = {
  respondidas: "var(--chart-1)",
  derivadas: "var(--chart-3)",
  cerradas: "var(--chart-5)",
}

export function Panel({ datos }: { datos: DatosPanel }) {
  const respondidas = datos.estados.respondida ?? 0
  const derivadas = datos.estados.derivada ?? 0
  const cerradas = datos.estados.cerrada ?? 0
  const total = respondidas + derivadas + cerradas
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  const sinRespuesta = datos.temas.filter((t) => t.sin_respuesta > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi titulo="Consultas" valor={total} nota={`últimos ${datos.dias} días`} />
        <Kpi titulo="Respondidas" valor={pct(respondidas)} sufijo="%" nota={`${respondidas} con lo publicado`} color={COLORES.respondidas} />
        <Kpi titulo="Derivadas" valor={pct(derivadas)} sufijo="%" nota={`${derivadas} a la redacción`} color={COLORES.derivadas} />
        <Kpi titulo="Pendientes" valor={datos.pendientes} nota="en la bandeja" />
        <Kpi
          titulo="Respuesta de la redacción"
          valor={datos.minutos_respuesta != null ? Math.round(datos.minutos_respuesta) : 0}
          sufijo=" min"
          nota={datos.minutos_respuesta != null ? "promedio" : "todavía sin datos"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Qué pasó con cada consulta</CardTitle>
            <CardDescription>Por día: respondidas con lo publicado, derivadas a la redacción y cerradas</CardDescription>
          </CardHeader>
          <CardContent>
            <Serie serie={datos.serie} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Por qué se derivó</CardTitle>
            <CardDescription>El porcentaje derivado es el número que más importa medir en el piloto</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {datos.motivos.length === 0 && <Vacio />}
            {datos.motivos.map((m, i) => (
              <Barra key={m.motivo} etiqueta={etiqueta(m.motivo)} valor={m.n} max={datos.motivos[0].n} color={COLORES.derivadas} retraso={i} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Temas sin respuesta</CardTitle>
            <CardDescription>Preguntas que no encontraron respaldo en lo publicado: posibles notas</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {sinRespuesta.length === 0 && <Vacio />}
            {sinRespuesta.map((t, i) => (
              <Barra
                key={t.tema}
                etiqueta={etiqueta(t.tema)}
                valor={t.sin_respuesta}
                max={sinRespuesta[0].sin_respuesta}
                color="var(--chart-4)"
                retraso={i}
                detalle={`${t.sin_respuesta} sin respuesta de ${t.total}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Consultas por lugar</CardTitle>
            <CardDescription>Comparado con el período anterior</CardDescription>
          </CardHeader>
          <CardContent>
            {datos.lugares.length === 0 && <Vacio />}
            <ul className="flex flex-col divide-y">
              {datos.lugares.map((l, i) => {
                const delta = l.actual - l.anterior
                return (
                  <motion.li
                    key={l.lugar}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-2 py-2 text-sm"
                  >
                    <MapPin className="size-4 text-primary" />
                    <span className="flex-1 font-medium">{l.lugar}</span>
                    <span className="tabular-nums">{l.actual}</span>
                    <span
                      className={
                        delta > 0
                          ? "flex w-12 items-center justify-end text-xs text-red-700 dark:text-red-300"
                          : "flex w-12 items-center justify-end text-xs text-muted-foreground"
                      }
                    >
                      {delta > 0 ? <ArrowUpRight className="size-3" /> : delta < 0 ? <ArrowDownRight className="size-3" /> : null}
                      {delta === 0 ? "=" : Math.abs(delta)}
                    </span>
                  </motion.li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Kpi({ titulo, valor, sufijo = "", nota, color }: { titulo: string; valor: number; sufijo?: string; nota: string; color?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {color && <span className="size-2 rounded-full" style={{ background: color }} />}
          {titulo}
        </span>
        <span className="font-heading text-3xl font-bold tabular-nums">
          <Numero valor={valor} />
          {sufijo}
        </span>
        <span className="text-xs text-muted-foreground">{nota}</span>
      </CardContent>
    </Card>
  )
}

function Numero({ valor }: { valor: number }) {
  const mv = useMotionValue(0)
  const texto = useTransform(mv, (v) => Math.round(v).toLocaleString("es"))
  useEffect(() => {
    const control = animate(mv, valor, { duration: 0.8, ease: "easeOut" })
    return control.stop
  }, [mv, valor])
  return <motion.span>{texto}</motion.span>
}

function Barra({ etiqueta, valor, max, color, retraso = 0, detalle }: { etiqueta: string; valor: number; max: number; color: string; retraso?: number; detalle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{etiqueta}</span>
        <span className="text-muted-foreground tabular-nums">{detalle ?? valor}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${max ? (valor / max) * 100 : 0}%` }}
          transition={{ delay: 0.1 + retraso * 0.05, duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  )
}

function Serie({ serie }: { serie: DatosPanel["serie"] }) {
  if (serie.length === 0) return <Vacio />
  const max = Math.max(...serie.map((d) => d.respondidas + d.derivadas + d.cerradas), 1)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-44 items-end gap-2">
        {serie.map((d, i) => {
          const total = d.respondidas + d.derivadas + d.cerradas
          return (
            <div key={d.dia} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover:opacity-100">{total}</span>
              <motion.div
                className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-md"
                initial={{ height: 0 }}
                animate={{ height: `${(total / max) * 100}%` }}
                transition={{ delay: i * 0.05, duration: 0.6, ease: "easeOut" }}
                title={`${d.respondidas} respondidas · ${d.derivadas} derivadas · ${d.cerradas} cerradas`}
              >
                {(["respondidas", "derivadas", "cerradas"] as const).map((k) =>
                  d[k] ? <div key={k} style={{ flexGrow: d[k], background: COLORES[k] }} className="border-t border-card first:border-t-0" /> : null,
                )}
              </motion.div>
              <span className="text-[11px] text-muted-foreground">
                {new Date(d.dia + "T12:00").toLocaleDateString("es", { day: "numeric", month: "short" })}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        {(Object.keys(COLORES) as (keyof typeof COLORES)[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLORES[k] }} />
            {k[0].toUpperCase() + k.slice(1)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Vacio() {
  return <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay datos para este período.</p>
}
