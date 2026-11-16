import { useEffect, useState } from "react"
import { LogIn, Terminal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { api, type Usuario } from "@/lib/api"

/** Ingreso de la redacción. Si todavía no hay nadie, explica cómo crear el primer admin. */
export function Entrar({ alEntrar }: { alEntrar: (u: Usuario) => void }) {
  const [email, setEmail] = useState("")
  const [clave, setClave] = useState("")
  const [error, setError] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [estado, setEstado] = useState<{ medio: string; hay_usuarios: boolean } | null>(null)

  useEffect(() => {
    api.estado().then(setEstado).catch(() => {})
  }, [])

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError("")
    try {
      alEntrar(await api.entrar(email, clave))
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm gap-4 p-6">
        <div className="flex items-center gap-2.5">
          <img src="/marca/isologo-circulo.svg" alt="" className="size-9" />
          <div className="leading-tight">
            <p className="font-heading text-base font-bold text-primary">Escucha y respuesta</p>
            <p className="text-xs text-muted-foreground">Redacción{estado?.medio && ` de ${estado.medio}`}</p>
          </div>
        </div>

        {estado && !estado.hay_usuarios ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="flex items-center gap-1.5 font-bold">
              <Terminal className="size-4" /> Falta crear el primer admin
            </p>
            <p className="text-muted-foreground">En el servidor, desde la carpeta backend:</p>
            <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">
              .venv/bin/python -m app.usuarios crear --email tu@medio.org --nombre "Tu nombre" --rol admin
            </code>
            <p className="text-muted-foreground">Después entra acá con ese correo. Al resto del equipo lo sumas desde la pestaña Equipo.</p>
          </div>
        ) : (
          <form onSubmit={entrar} className="flex flex-col gap-3">
            <Input type="email" required autoComplete="username" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Clave"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={enviando}>
              <LogIn /> Entrar
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
