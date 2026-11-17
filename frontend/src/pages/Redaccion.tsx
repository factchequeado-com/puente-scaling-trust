import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { BarChart3, Database, Inbox, LogOut, MessageCircle, RefreshCw, Settings, Users } from "lucide-react"
import { toast } from "sonner"

import { Ajustes } from "@/components/redaccion/Ajustes"
import { Bandeja } from "@/components/redaccion/Bandeja"
import { Base } from "@/components/redaccion/Base"
import { Entrar } from "@/components/redaccion/Entrar"
import { Equipo } from "@/components/redaccion/Equipo"
import { Panel } from "@/components/redaccion/Panel"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, ErrorApi, type Consulta, type Nota, type Panel as DatosPanel, type Usuario } from "@/lib/api"

/** La redacción pide sesión: sin ella muestra el ingreso. */
export function Redaccion() {
  const [yo, setYo] = useState<Usuario | null | undefined>(undefined)
  useEffect(() => {
    api.yo().then(setYo).catch(() => setYo(null))
  }, [])
  const vencer = useCallback(() => setYo(null), [])
  if (yo === undefined) return null
  if (!yo) return <Entrar alEntrar={setYo} />
  return (
    <Escritorio
      yo={yo}
      alSalir={() => {
        api.salir().finally(() => setYo(null))
      }}
      alVencer={vencer}
    />
  )
}

function Escritorio({ yo, alSalir, alVencer }: { yo: Usuario; alSalir: () => void; alVencer: () => void }) {
  const [medio, setMedio] = useState("")
  const [bandeja, setBandeja] = useState<Consulta[] | null>(null)
  const [panel, setPanel] = useState<DatosPanel | null>(null)
  const [notas, setNotas] = useState<Nota[] | null>(null)
  const [dias, setDias] = useState(7)
  const [actualizando, setActualizando] = useState(false)
  const pendientes = bandeja?.filter((c) => c.estado === "derivada" && !c.resuelta_en).length ?? 0

  const cargar = useCallback(async () => {
    const [b, a, p, n, e] = await Promise.all([api.bandeja(false), api.automaticas(), api.panel(dias), api.notas(), api.estado()])
    setBandeja([...b, ...a])
    setPanel(p)
    setNotas(n)
    setMedio(e.medio)
  }, [dias])

  useEffect(() => {
    const fallo = (error: unknown) => {
      if (error instanceof ErrorApi && error.status === 401) alVencer()
      else toast.error("No se pudo conectar con el backend")
    }
    cargar().catch(fallo)
    const t = setInterval(() => cargar().catch((e) => e instanceof ErrorApi && e.status === 401 && alVencer()), 15000)
    return () => clearInterval(t)
  }, [cargar, alVencer])

  async function actualizarRss() {
    setActualizando(true)
    try {
      const r = await api.ingesta()
      toast.success(r.notas_nuevas ? `${r.notas_nuevas} notas nuevas en la base` : "No hay notas nuevas en el RSS")
      cargar()
    } catch {
      toast.error("No se pudo leer el RSS")
    } finally {
      setActualizando(false)
    }
  }

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/marca/isologo-circulo.svg" alt="" className="size-8" />
            <span className="leading-tight">
              <span className="block font-heading text-base font-bold text-primary">Respuestas Verificadas</span>
              <span className="block text-xs text-muted-foreground">Redacción{medio && ` de ${medio}`}</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/chat" target="_blank" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <MessageCircle /> <span className="hidden sm:inline">Abrir el chat</span>
            </Link>
            <Button variant="outline" size="sm" onClick={actualizarRss} disabled={actualizando}>
              <motion.span animate={actualizando ? { rotate: 360 } : { rotate: 0 }} transition={actualizando ? { repeat: Infinity, duration: 1, ease: "linear" } : {}}>
                <RefreshCw />
              </motion.span>
              <span className="hidden sm:inline">Actualizar RSS</span>
            </Button>
            <span className="hidden text-right text-xs leading-tight md:block">
              <span className="block font-medium">{yo.nombre}</span>
              <span className="text-muted-foreground">{yo.rol === "admin" ? "Admin" : "Periodista"}</span>
            </span>
            <Button variant="ghost" size="icon-sm" onClick={alSalir} aria-label="Salir" title="Salir">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="bandeja">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="bandeja" className="px-3">
                <Inbox /> Bandeja
                {!!pendientes && (
                  <motion.span
                    key={pendientes}
                    initial={{ scale: 1.4 }}
                    animate={{ scale: 1 }}
                    className="ml-1 rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground"
                  >
                    {pendientes}
                  </motion.span>
                )}
              </TabsTrigger>
              <TabsTrigger value="panel" className="px-3">
                <BarChart3 /> Panel
              </TabsTrigger>
              <TabsTrigger value="base" className="px-3">
                <Database /> Base de notas
              </TabsTrigger>
              <TabsTrigger value="ajustes" className="px-3">
                <Settings /> Ajustes
              </TabsTrigger>
              {yo.rol === "admin" && (
                <TabsTrigger value="equipo" className="px-3">
                  <Users /> Equipo
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="bandeja" className="mt-4">
            {bandeja ? <Bandeja consultas={bandeja} alCambiar={cargar} /> : <Cargando />}
          </TabsContent>
          <TabsContent value="panel" className="mt-4 flex flex-col gap-3">
            <div className="flex gap-1">
              {[1, 7, 30].map((d) => (
                <Button key={d} size="sm" variant={dias === d ? "secondary" : "ghost"} onClick={() => setDias(d)}>
                  {d === 1 ? "Hoy" : `${d} días`}
                </Button>
              ))}
            </div>
            {panel ? <Panel datos={panel} /> : <Cargando />}
          </TabsContent>
          <TabsContent value="base" className="mt-4">
            {notas ? <Base notas={notas} /> : <Cargando />}
          </TabsContent>
          <TabsContent value="ajustes" className="mt-4">
            <Ajustes esAdmin={yo.rol === "admin"} />
          </TabsContent>
          {yo.rol === "admin" && (
            <TabsContent value="equipo" className="mt-4">
              <Equipo yo={yo} />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  )
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  )
}
