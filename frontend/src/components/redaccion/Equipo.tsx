import { useCallback, useEffect, useState } from "react"
import { UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, type Usuario } from "@/lib/api"

/** Las personas de la redacción. Solo lo ve un admin. */
export function Equipo({ yo }: { yo: Usuario }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", clave: "", rol: "periodista" })

  const cargar = useCallback(() => api.usuarios().then(setUsuarios), [])
  useEffect(() => {
    cargar().catch(() => toast.error("No se pudo leer el equipo"))
  }, [cargar])

  async function cambiar(u: Usuario, cambio: Partial<Pick<Usuario, "rol" | "activo">>) {
    try {
      await api.cambiarUsuario(u.id, cambio)
      cargar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar")
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.crearUsuario(nuevo)
      toast.success(`${nuevo.nombre} ya puede entrar con su correo y la clave que le diste`)
      setNuevo({ nombre: "", email: "", clave: "", rol: "periodista" })
      cargar()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="text-right">Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">
                    {u.nombre} {u.id === yo.id && <span className="text-xs text-muted-foreground">(tú)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell>
                  <button type="button" onClick={() => cambiar(u, { rol: u.rol === "admin" ? "periodista" : "admin" })} title="Cambiar el rol">
                    <Badge variant={u.rol === "admin" ? "default" : "secondary"}>{u.rol === "admin" ? "Admin" : "Periodista"}</Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <Switch checked={u.activo} onCheckedChange={(activo) => cambiar(u, { activo })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="gap-3 p-4">
        <div>
          <h2 className="font-heading text-base font-bold">Sumar a alguien</h2>
          <p className="text-sm text-muted-foreground">
            Periodista: ve la bandeja, responde y ve el panel. Admin: además cambia los ajustes y el equipo.
          </p>
        </div>
        <form onSubmit={crear} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <Input required placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <Input required type="email" placeholder="Correo" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
          <Input
            required
            minLength={10}
            type="password"
            placeholder="Clave inicial (10 o más)"
            value={nuevo.clave}
            onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })}
          />
          <select
            value={nuevo.rol}
            onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="periodista">Periodista</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit">
            <UserPlus /> Sumar
          </Button>
        </form>
      </Card>
    </div>
  )
}
