import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { ExternalLink, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { etiquetaSeccion, type Nota } from "@/lib/api"

export function Base({ notas }: { notas: Nota[] }) {
  const [filtro, setFiltro] = useState("")
  const visibles = useMemo(
    () => notas.filter((n) => n.titulo.toLowerCase().includes(filtro.toLowerCase())),
    [notas, filtro],
  )
  const fragmentos = notas.reduce((s, n) => s + n.fragmentos, 0)
  const deRedaccion = notas.filter((n) => n.fuente === "redaccion").length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {notas.length} notas · {fragmentos} fragmentos · {deRedaccion} respuestas de la redacción
        </p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por título" className="pl-8" />
        </div>
      </div>
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nota</TableHead>
              <TableHead className="hidden sm:table-cell">Sección</TableHead>
              <TableHead className="hidden md:table-cell">Fecha</TableHead>
              <TableHead className="text-right">Fragmentos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((n, i) => (
              <motion.tr
                key={n.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 20) * 0.015 }}
                className="border-b transition-colors hover:bg-muted/50"
              >
                <TableCell className="max-w-md whitespace-normal">
                  {n.url.startsWith("http") ? (
                    <a href={n.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1 font-medium hover:text-primary">
                      {n.titulo}
                      <ExternalLink className="mt-1 size-3 shrink-0 opacity-0 group-hover:opacity-100" />
                    </a>
                  ) : (
                    <span className="font-medium">{n.titulo}</span>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={n.fuente === "redaccion" ? "default" : "secondary"}>{etiquetaSeccion(n.seccion)}</Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {new Date(n.fecha).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{n.fragmentos}</TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
