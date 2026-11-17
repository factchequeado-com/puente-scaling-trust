/*
 * Escucha y respuesta: el chat como botón flotante en el sitio del medio.
 *
 * Se pega una sola línea antes de </body> (en WordPress: Apariencia > Editor de temas, o un plugin de "header
 * y footer"):
 *
 *   <script src="https://escucha.mimedio.org/widget.js" defer></script>
 *
 * Opcionales, como atributos del mismo <script>:
 *   data-color="#f0ab34"                    color del botón (el ícono pasa a oscuro si el color es claro)
 *   data-invitacion="¿Viste algo dudoso?"   globito que aparece la primera vez ("" para no mostrarlo)
 *   data-lado="izquierda"                   si el botón va abajo a la izquierda
 *
 * El chat vive en un iframe servido por la instalación de Escucha y respuesta: el sitio del medio no ve la
 * conversación ni guarda nada, y la conversación sigue aunque la persona cambie de página.
 */
(function () {
  if (window.__escuchaWidget) return
  window.__escuchaWidget = true

  var script = document.currentScript || document.querySelector('script[src*="widget.js"]')
  var origen = new URL(script.src, location.href).origin
  var color = script.getAttribute("data-color") || "#f0ab34"
  // Ícono oscuro sobre colores claros (como el naranja), blanco sobre oscuros.
  var rgb = color.replace("#", "").match(/../g) || ["67", "05", "7c"]
  var luz = (parseInt(rgb[0], 16) * 299 + parseInt(rgb[1], 16) * 587 + parseInt(rgb[2], 16) * 114) / 1000
  var colorIcono = luz > 150 ? "#360646" : "#fff"
  var invitacion = script.hasAttribute("data-invitacion")
    ? script.getAttribute("data-invitacion")
    : "¿Viste algo y no sabes si es cierto? Pregúntame"
  var lado = script.getAttribute("data-lado") === "izquierda" ? "left" : "right"
  var CLAVE = "escucha.widget.visto"

  var estilo = document.createElement("style")
  estilo.textContent =
    ".escucha-boton{position:fixed;bottom:20px;" + lado + ":20px;z-index:2147483646;width:60px;height:60px;border:0;" +
    "border-radius:50%;background:" + color + ";color:" + colorIcono + ";cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);" +
    "display:grid;place-items:center;transition:transform .2s ease}" +
    ".escucha-boton:hover{transform:scale(1.06)}.escucha-boton:focus-visible{outline:3px solid #00d8cd;outline-offset:3px}" +
    ".escucha-boton svg{width:28px;height:28px}" +
    ".escucha-panel{position:fixed;bottom:92px;" + lado + ":20px;z-index:2147483646;width:380px;height:min(620px,calc(100vh - 120px));" +
    "border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.28);opacity:0;" +
    "transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .2s ease,transform .2s ease}" +
    ".escucha-panel.abierto{opacity:1;transform:none;pointer-events:auto}" +
    ".escucha-panel iframe{width:100%;height:100%;border:0;display:block}" +
    ".escucha-globo{position:fixed;bottom:34px;" + lado + ":92px;z-index:2147483646;max-width:240px;padding:10px 14px;" +
    "border-radius:14px;background:#fff;color:#1a1a1a;font:14px/1.35 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18);" +
    "cursor:pointer;animation:escucha-entra .3s ease}" +
    "@keyframes escucha-entra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
    "@media (max-width:480px){.escucha-panel{" + lado + ":8px;width:calc(100vw - 16px);top:8px;bottom:84px;height:auto}}"
  document.head.appendChild(estilo)

  var ICONO_CHAT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>'
  var ICONO_CERRAR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M18 6 6 18M6 6l12 12"/></svg>'

  var boton = document.createElement("button")
  boton.className = "escucha-boton"
  boton.type = "button"
  boton.innerHTML = ICONO_CHAT
  boton.setAttribute("aria-label", "Abrir el chat")
  boton.setAttribute("aria-expanded", "false")

  var panel = document.createElement("div")
  panel.className = "escucha-panel"
  panel.setAttribute("role", "dialog")
  panel.setAttribute("aria-label", "Chat")
  var iframe = null // se crea al abrir por primera vez: no carga nada hasta que la persona lo pide

  var globo = null
  function cerrarGlobo() {
    if (globo) globo.remove()
    globo = null
    try {
      localStorage.setItem(CLAVE, "1")
    } catch (e) {}
  }

  function abrir(abierto) {
    if (abierto && !iframe) {
      iframe = document.createElement("iframe")
      iframe.src = origen + "/chat"
      iframe.title = "Chat"
      panel.appendChild(iframe)
    }
    panel.classList.toggle("abierto", abierto)
    boton.innerHTML = abierto ? ICONO_CERRAR : ICONO_CHAT
    boton.setAttribute("aria-label", abierto ? "Cerrar el chat" : "Abrir el chat")
    boton.setAttribute("aria-expanded", String(abierto))
    if (abierto) cerrarGlobo()
  }

  boton.addEventListener("click", function () {
    abrir(!panel.classList.contains("abierto"))
  })
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panel.classList.contains("abierto")) abrir(false)
  })

  document.body.appendChild(panel)
  document.body.appendChild(boton)

  var visto = false
  try {
    visto = localStorage.getItem(CLAVE) === "1"
  } catch (e) {}
  if (invitacion && !visto) {
    setTimeout(function () {
      if (panel.classList.contains("abierto")) return
      globo = document.createElement("div")
      globo.className = "escucha-globo"
      globo.textContent = invitacion
      globo.addEventListener("click", function () {
        abrir(true)
      })
      document.body.appendChild(globo)
    }, 2500)
  }
})()
