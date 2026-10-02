import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Uma aba mantida aberta durante uma nova compilação pode pedir um chunk
// versionado que já foi substituído. Recarrega com o HTML mais recente uma vez.
const PRELOAD_RELOAD_KEY = 'defesacivil-preload-reload-at'
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  try {
    const ultimaRecarga = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0)
    if (Date.now() - ultimaRecarga < 30_000) {
      console.error('Não foi possível carregar um módulo após atualizar a página.', event)
      return
    }
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()))
    window.location.reload()
  } catch (error) {
    console.error('Falha ao recuperar o módulo da aplicação.', error)
  }
})

// Registra o Service Worker para suporte offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Verifica atualizações do SW a cada 30 minutos
        setInterval(() => reg.update(), 30 * 60 * 1000)

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            // Novo SW instalado e pronto — recarrega silenciosamente quando a aba fica ativa
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ tipo: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch(() => {
        // falha silenciosa — app funciona sem SW
      })

    // Recarrega quando o SW muda (novo SW ativado)
    let swRefreshado = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!swRefreshado) {
        swRefreshado = true
        // não força reload automático, deixa o usuário continuar
      }
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
