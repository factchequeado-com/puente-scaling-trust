import { BrowserRouter, Route, Routes, useSearchParams } from "react-router-dom"

import { Chat } from "@/components/chat/Chat"
import { Toaster } from "@/components/ui/sonner"
import { Inicio } from "@/pages/Inicio"
import { Redaccion } from "@/pages/Redaccion"

/** /chat es la versión para embeber por iframe. Con ?detalles=1 muestra las etiquetas de cada respuesta. */
function ChatSolo() {
  const [params] = useSearchParams()
  return (
    <div className="h-svh">
      <Chat detalles={params.get("detalles") === "1"} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/chat" element={<ChatSolo />} />
        <Route path="/redaccion" element={<Redaccion />} />
      </Routes>
      <Toaster position="bottom-right" />
    </BrowserRouter>
  )
}
