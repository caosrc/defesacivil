// URL base do backend Express + WebSocket.
//
// Em DESENVOLVIMENTO (Replit ou local) basta deixar VITE_API_URL vazio:
// o Vite faz proxy de /api e /ws para localhost:3001 (ver vite.config.ts),
// então URLs relativas funcionam.
//
// Em PRODUÇÃO no Netlify (que é só hospedagem estática e não roda Node),
// é OBRIGATÓRIO definir VITE_API_URL apontando para o backend que está rodando
// em outro lugar (ex.: o Deployment do Replit), senão GPS em tempo real,
// SOS e a sincronização de ocorrências entre agentes não funcionam.
//
// Exemplo, em Netlify > Site settings > Environment variables, defina:
//   VITE_API_URL = https://defesacivilob.SEU-USUARIO.replit.app
// O VITE_WS_URL é opcional — por padrão é derivado do VITE_API_URL,
// trocando http→ws e https→wss.

const rawApi = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
export const API_BASE = rawApi.replace(/\/+$/, '')

const rawWs = (import.meta.env.VITE_WS_URL as string | undefined) ?? ''
const WS_OVERRIDE = rawWs.replace(/\/+$/, '')

// Constrói a URL do WebSocket. Adiciona "/ws" se a base não terminar nele.
export function getWsUrl(): string {
  if (WS_OVERRIDE) {
    return WS_OVERRIDE.endsWith('/ws') ? WS_OVERRIDE : `${WS_OVERRIDE}/ws`
  }
  if (API_BASE) {
    const wsBase = API_BASE.replace(/^http/i, (m) => (m.toLowerCase() === 'https' ? 'wss' : 'ws'))
    return `${wsBase}/ws`
  }
  // Fallback (dev no Replit / preview do Vite com proxy).
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws`
}
