import { useState, useEffect, useCallback, useMemo, lazy, Suspense, useRef, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import './App.css'
import Login, { estaLogado, agenteEscolhido, getAgenteLogado } from './components/Login'
import type { Ocorrencia, NivelRisco } from './types'
import { NATUREZA_ICONE } from './types'
import { listarOcorrencias, criarOcorrencia, enviarOcorrenciaServidor, ApiError } from './api'
import { wsOn, wsAnunciarOnline } from './wsClient'
import { supabase, supabaseDisponivel } from './supabaseClient'
import { EVT_ROTA_RESGATE } from './sos'
import { registrarPushSeNecessario, pedirPermissaoEInscrever, getStatusNotificacoes } from './pushNotifications'
import AgentesOnline from './components/AgentesOnline'
import BotaoSos from './components/BotaoSos'
import BannerNotifSos from './components/BannerNotifSos'
import { cacheOcorrencias, getCachedOcorrencias, getPending, removePending, countPending } from './offline'

interface EquipamentoCampoMapa {
  id: number
  material_nome: string | null
  latitude: number | null
  longitude: number | null
  rua: string | null
  bairro: string | null
  observacao: string | null
  status: string
}

const MapaOcorrencias = lazy(() => import('./components/MapaOcorrencias'))
const NovaOcorrencia = lazy(() => import('./components/NovaOcorrencia'))
const DetalheOcorrencia = lazy(() => import('./components/DetalheOcorrencia'))
const ChecklistViatura = lazy(() => import('./components/ChecklistViatura'))
const EscalaAgentes = lazy(() => import('./components/EscalaAgentes'))
const Dashboard = lazy(() => import('./components/Dashboard'))
const SosOverlay = lazy(() => import('./components/SosOverlay'))
const MateriaisEmprestimos = lazy(() => import('./components/MateriaisEmprestimos'))
const Planejamento = lazy(() => import('./components/Planejamento'))
const PlanoEmergencia = lazy(() => import('./components/PlanoEmergencia'))

type Aba = 'lista' | 'mapa' | 'nova' | 'viatura' | 'escala' | 'materiais' | 'planejamento' | 'plano_emergencia'

function dataLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hojeStr(): string {
  return dataLocal(new Date().toISOString())
}

function formatarDataExibicao(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-')
  return `${d}/${m}/${y}`
}

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function formatarItemData(d: string): string {
  if (d === 'todas') return 'Todas as datas'
  if (d.length === 7) {
    const [y, m] = d.split('-')
    return `${MESES_PT[parseInt(m) - 1]} ${y}`
  }
  return d === hojeStr() ? `Hoje — ${formatarDataExibicao(d)}` : formatarDataExibicao(d)
}

function NivelBadge({ nivel }: { nivel: NivelRisco }) {
  return (
    <span className={`nivel-badge nivel-${nivel}`}>
      {nivel === 'baixo' ? '🟢 Baixo' : nivel === 'medio' ? '🟡 Médio' : '🔴 Alto'}
    </span>
  )
}


const LazyFallback = () => <div className="carregando">⏳ Carregando...</div>

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { erro: string | null }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props)
    this.state = { erro: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { erro: error?.message ?? 'Erro desconhecido' }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }
  render() {
    if (this.state.erro) {
      return this.props.fallback ?? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#c00' }}>
          <div style={{ fontSize: '2rem' }}>⚠️</div>
          <strong>Algo deu errado</strong>
          <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: '0.5rem' }}>{this.state.erro}</p>
          <button onClick={() => this.setState({ erro: null })} style={{ marginTop: '1rem', padding: '0.5rem 1.5rem' }}>
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function BannerInstalar() {
  // Lê o evento capturado globalmente antes do React montar (index.html)
  const [promptEvento, setPromptEvento] = useState<BeforeInstallPromptEvent | null>(
    () => (window as Window & { __pwaInstallPrompt__?: BeforeInstallPromptEvent }).__pwaInstallPrompt__ ?? null
  )
  const [descartado, setDescartado] = useState(() => sessionStorage.getItem('pwa-instalar-descartado') === '1')
  const [ios, setIos] = useState(false)
  const [instalado, setInstalado] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) { setInstalado(true); return }

    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))

    // Captura caso o evento chegue depois do React montar
    const onPromptReady = () => {
      const w = window as Window & { __pwaInstallPrompt__?: BeforeInstallPromptEvent }
      if (w.__pwaInstallPrompt__) setPromptEvento(w.__pwaInstallPrompt__)
    }
    window.addEventListener('pwa-prompt-ready', onPromptReady)
    const onInstalled = () => setInstalado(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('pwa-prompt-ready', onPromptReady)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Só mostra se: tem prompt nativo disponível OU é iOS (que nunca dispara o evento)
  if (instalado || descartado || (!promptEvento && !ios)) return null

  async function instalar() {
    if (promptEvento) {
      await promptEvento.prompt()
      const { outcome } = await promptEvento.userChoice
      if (outcome === 'accepted') {
        setInstalado(true)
        return
      }
      setPromptEvento(null)
    }
    setDescartado(true)
    sessionStorage.setItem('pwa-instalar-descartado', '1')
  }

  function descartar() {
    setDescartado(true)
    sessionStorage.setItem('pwa-instalar-descartado', '1')
  }

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-icone">
        <img src="/logo-dc.jpg" alt="" />
      </div>
      <div className="pwa-banner-texto">
        <strong>Instale o app</strong>
        <span>
          {ios
            ? 'Toque em Compartilhar ↑ e depois “Adicionar à Tela de Início”.'
            : 'Adicione na tela inicial para receber alertas mesmo com o app fechado.'}
        </span>
      </div>
      {promptEvento
        ? <button className="pwa-banner-btn" onClick={instalar}>Instalar</button>
        : <button className="pwa-banner-btn" onClick={descartar}>Ok, entendi</button>
      }
      <button className="pwa-banner-fechar" onClick={descartar}>✕</button>
    </div>
  )
}

export default function App() {
  const [logado, setLogado] = useState(estaLogado() && agenteEscolhido())
  const [aba, setAba] = useState<Aba>('lista')
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionada, setSelecionada] = useState<Ocorrencia | null>(null)
  const [filtroNivel, setFiltroNivel] = useState<NivelRisco | 'todos'>('todos')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'resolvido'>('todos')
  const [filtroData, setFiltroData] = useState<string>(hojeStr())
  const [buscando, setBuscando] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  // Destino externo enviado pelo botão "Traçar rota de resgate" do SOS.
  // Quando preenchido, o mapa abre com o pino e a rota já calculados.
  const [destinoSos, setDestinoSos] = useState<{ lat: number; lng: number } | null>(null)
  const [destinoCampo, setDestinoCampo] = useState<{ lat: number; lng: number; nome?: string; soMostrar?: boolean } | null>(null)
  const [equipamentosCampoMapa, setEquipamentosCampoMapa] = useState<EquipamentoCampoMapa[]>([])

  useEffect(() => {
    function aoSolicitarRota(e: Event) {
      const d = (e as CustomEvent<{ lat: number; lng: number }>).detail
      if (typeof d?.lat !== 'number' || typeof d?.lng !== 'number') return
      setDestinoSos({ lat: d.lat, lng: d.lng })
      setAba('mapa')
    }
    window.addEventListener(EVT_ROTA_RESGATE, aoSolicitarRota)
    return () => window.removeEventListener(EVT_ROTA_RESGATE, aoSolicitarRota)
  }, [])

  // Carrega equipamentos em campo para o mapa
  useEffect(() => {
    async function carregarCampo() {
      if (supabaseDisponivel) {
        try {
          const { data } = await supabase
            .from('equipamentos_campo')
            .select('id, material_nome, latitude, longitude, rua, bairro, observacao, status')
            .eq('status', 'ativo')
          setEquipamentosCampoMapa((data ?? []) as EquipamentoCampoMapa[])
          return
        } catch { /* cai para Express */ }
      }
      try {
        const res = await fetch('/api/equipamentos-campo')
        const ct = res.headers.get('content-type') || ''
        if (res.ok && !ct.includes('text/html')) {
          const data = await res.json()
          const ativos = (Array.isArray(data) ? data : []).filter((e: EquipamentoCampoMapa) => e.status === 'ativo')
          setEquipamentosCampoMapa(ativos as EquipamentoCampoMapa[])
        }
      } catch { /* silencioso */ }
    }
    carregarCampo()
    // Recarrega quando o WebSocket indica atualização de campo
    const handler = (msg: MessageEvent) => {
      try {
        const m = JSON.parse(msg.data)
        if (m?.tipo === 'campo_atualizado') carregarCampo()
      } catch { /* ignore */ }
    }
    window.addEventListener('ws-message', handler as EventListener)
    return () => window.removeEventListener('ws-message', handler as EventListener)
  }, [])

  // Quando o agente entra no app, anuncia presença online e registra push
  useEffect(() => {
    if (!logado) return
    const agente = getAgenteLogado()
    if (!agente) return
    // Re-anuncia presença com o nome correto do agente (o WS pode ter conectado
    // antes do login, quando o nome ainda estava vazio)
    wsAnunciarOnline()
    // Aguarda 2s para não pedir permissão no exato momento do clique de login
    // (alguns navegadores bloqueiam permissions sem gesto recente; 2s funciona
    // porque o gesto do login ainda conta).
    const t = setTimeout(async () => {
      await registrarPushSeNecessario(agente)
      const s = await getStatusNotificacoes()
      setStatusNotif(s)
    }, 2000)
    return () => clearTimeout(t)
  }, [logado])

  async function ativarNotificacoes() {
    if (ativandoNotif) return
    const agente = getAgenteLogado()
    if (!agente) return
    setAtivandoNotif(true)
    try {
      const resultado = await pedirPermissaoEInscrever(agente)
      if (resultado === 'ok') {
        setStatusNotif('ativo')
        showToast('🔔 Notificações de SOS ativadas!')
      } else if (resultado === 'negado') {
        setStatusNotif('negado')
        showToast('🔕 Notificações bloqueadas. Libere nas configurações do navegador.')
      } else if (resultado === 'sem-suporte') {
        showToast('⚠️ Este navegador não suporta notificações push.')
      } else {
        showToast('⚠️ Não foi possível ativar. Verifique se o app foi instalado e permita notificações nas configurações do navegador.')
      }
    } finally {
      setAtivandoNotif(false)
    }
  }
  const [pendingCount, setPendingCount] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)
  const [sincronizandoIds, setSincronizandoIds] = useState<Set<number>>(new Set())
  const [toastMsg, setToastMsg] = useState('')
  const [statusNotif, setStatusNotif] = useState<'ativo'|'concedido'|'negado'|'sem-suporte'|'desconhecido'|null>(null)
  const [ativandoNotif, setAtivandoNotif] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string, duracao = 4000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastMsg(msg)
    toastTimerRef.current = setTimeout(() => {
      setToastMsg('')
      toastTimerRef.current = null
    }, duracao)
  }

  const atualizarPendingCount = useCallback(async () => {
    const n = await countPending()
    setPendingCount(n)
  }, [])

  const carregar = useCallback(async (_forcar = false) => {
    setCarregando(true)
    let serverData: Ocorrencia[] = []
    try {
      serverData = await listarOcorrencias()
      await cacheOcorrencias(serverData)
    } catch {
      serverData = await getCachedOcorrencias()
    }
    const pending = await getPending()
    const offlineItems: Ocorrencia[] = pending.map((p, i) => ({
      id: -(i + 1),
      tipo: p.tipo ?? '',
      natureza: p.natureza ?? '',
      subnatureza: p.subnatureza ?? null,
      nivel_risco: p.nivel_risco ?? 'baixo',
      status_oc: p.status_oc ?? 'ativo',
      fotos: p.fotos ?? [],
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      endereco: p.endereco ?? null,
      proprietario: p.proprietario ?? null,
      responsavel_registro: p.responsavel_registro ?? null,
      situacao: p.situacao ?? null,
      recomendacao: p.recomendacao ?? null,
      conclusao: p.conclusao ?? null,
      data_ocorrencia: p.data_ocorrencia ?? null,
      agentes: Array.isArray(p.agentes) ? p.agentes : [],
      vistorias: Array.isArray(p.vistorias) ? p.vistorias : [],
      created_at: p._savedAt ?? new Date().toISOString(),
      _offline: true,
      _localId: p.localId,
    }))
    setOcorrencias([...offlineItems, ...serverData])
    setCarregando(false)
    await atualizarPendingCount()
  }, [atualizarPendingCount])

  const sincronizar = useCallback(async (silencioso = false) => {
    if (sincronizando) return
    const pending = await getPending()
    if (pending.length === 0) return
    setSincronizando(true)
    let ok = 0
    let falhas = 0
    let ultimoErro = ''
    for (const item of pending) {
      const { localId, _savedAt, _offline, _localId, ...data } = item
      void _offline; void _localId; void _savedAt
      try {
        await enviarOcorrenciaServidor(data)
        await removePending(localId)
        ok++
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status >= 400 && err.status < 500) {
            console.error(`[sync] Item ${localId} rejeitado (${err.status}): ${err.message} — removendo da fila`)
            await removePending(localId).catch(() => {})
          } else {
            console.warn(`[sync] Item ${localId} falhou (${err.status}): ${err.message}`)
            ultimoErro = err.message
            falhas++
          }
        } else {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[sync] Item ${localId} falhou por erro de rede:`, err)
          ultimoErro = msg
          falhas++
        }
      }
    }
    setSincronizando(false)
    await atualizarPendingCount()
    if (ok > 0) {
      await carregar()
      if (!silencioso) {
        showToast(falhas > 0
          ? `✅ ${ok} sincronizada(s). ⚠️ ${falhas} pendente(s) — ${ultimoErro || 'verifique a conexão'}.`
          : `✅ ${ok} ocorrência(s) sincronizadas com sucesso!`
        )
      }
    } else if (falhas > 0) {
      showToast(`⚠️ Falha ao sincronizar: ${ultimoErro || 'verifique a conexão e tente novamente'}.`)
    }
  }, [sincronizando, carregar, atualizarPendingCount])

  const sincronizarItem = useCallback(async (localId: number) => {
    setSincronizandoIds(prev => new Set([...prev, localId]))
    try {
      // Lê os dados BRUTOS do IndexedDB — mesma origem que criarOcorrencia usa online.
      // Evita qualquer diferença introduzida pelo mapeamento em carregar().
      const pending = await getPending()
      const item = pending.find(p => p.localId === localId)
      if (!item) throw new Error('Ocorrência não encontrada na fila de pendentes')

      // Remove campos exclusivos do IDB; mantém exatamente o que o formulário salvou.
      const { localId: _li, _savedAt: _sa, _offline: _off, _localId: _lid, id: _id, created_at: _ca, ...dados } = item as Record<string, unknown>
      void _li; void _sa; void _off; void _lid; void _id; void _ca

      // enviarOcorrenciaServidor comprime as fotos automaticamente antes de enviar
      // ao Supabase, evitando o limite de 10 MB do PostgREST (causa do timeout).
      await enviarOcorrenciaServidor(dados as Omit<Ocorrencia, 'id' | 'created_at'>)
      await removePending(localId)
      await carregar()
      showToast('✅ Ocorrência sincronizada com sucesso!')
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error ? err.message : 'Verifique a conexão e tente novamente'
      console.error('[sync-item] Falha ao sincronizar item', localId, ':', err)
      // Duração maior (8s) para que o agente leia o motivo do erro no celular
      showToast(`⚠️ Falha ao sincronizar: ${msg}`, 8000)
    } finally {
      setSincronizandoIds(prev => {
        const next = new Set(prev)
        next.delete(localId)
        return next
      })
    }
  }, [carregar])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Sincroniza pendentes assim que o app carrega (se online e houver itens)
  useEffect(() => {
    if (!navigator.onLine) return
    countPending().then(n => { if (n > 0) sincronizar(true) }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza quando o app volta ao primeiro plano (ex: volta da tela do celular)
  useEffect(() => {
    function aoRetomarFoco() {
      if (navigator.onLine) sincronizar(true)
    }
    document.addEventListener('visibilitychange', aoRetomarFoco)
    return () => document.removeEventListener('visibilitychange', aoRetomarFoco)
  }, [sincronizar])

  // Pré-carrega TODOS os chunks lazy assim que o app abre online,
  // para que o Service Worker cacheie tudo e o app funcione 100% offline
  // mesmo em telas que o usuário ainda não visitou.
  useEffect(() => {
    if (!navigator.onLine) return
    const id = window.setTimeout(() => {
      Promise.all([
        import('./components/MapaOcorrencias'),
        import('./components/NovaOcorrencia'),
        import('./components/DetalheOcorrencia'),
        import('./components/ChecklistViatura'),
        import('./components/EscalaAgentes'),
        import('./components/Dashboard'),
        import('./components/MateriaisEmprestimos'),
        import('./components/Planejamento'),
        import('./components/PlanoEmergencia'),
      ]).catch(() => { /* sem internet ou bloqueado, ignora */ })
    }, 1500)
    return () => window.clearTimeout(id)
  }, [])

  // Realtime: recarrega a lista quando outro usuário cria/edita/apaga uma ocorrência
  useEffect(() => {
    const off = wsOn('ocorrencias_atualizadas', () => { carregar() })
    return off
  }, [carregar])

  useEffect(() => {
    const goOnline = () => { setIsOnline(true); setTimeout(() => sincronizar(true), 800) }
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [sincronizar])

  async function exportarTudoKMZ() {
    const comGeo = ocorrencias.filter((o) => o.lat && o.lng)
    if (!comGeo.length) { alert('Nenhuma ocorrência com GPS para exportar.'); return }
    const placemarks = comGeo.map((o) => `
    <Placemark>
      <name>${o.natureza}</name>
      <description><![CDATA[
        <b>Tipo:</b> ${o.tipo}<br/>
        <b>Natureza:</b> ${o.natureza}${o.subnatureza ? ` (${o.subnatureza})` : ''}<br/>
        <b>Nível:</b> ${o.nivel_risco}<br/>
        <b>Status:</b> ${o.status_oc}<br/>
        ${o.endereco ? `<b>Endereço:</b> ${o.endereco}<br/>` : ''}
        ${o.proprietario ? `<b>Proprietário:</b> ${o.proprietario}<br/>` : ''}
        <b>Data:</b> ${new Date(o.created_at).toLocaleString('pt-BR')}
      ]]></description>
      <Point><coordinates>${o.lng},${o.lat},0</coordinates></Point>
    </Placemark>`).join('\n')
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Defesa Civil Ouro Branco — Todas as Ocorrências</name>
    ${placemarks}
  </Document>
</kml>`
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    zip.file('ocorrencias.kml', kml)
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `defesacivil_ourobranco_${Date.now()}.kmz`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportarExcel() {
    const { exportarTodasExcel } = await import('./exportExcel')
    await exportarTodasExcel(ocorrenciasFiltradas)
  }

  const datasDisponiveis = useMemo(() => {
    const mesAtual = hojeStr().slice(0, 7)
    const diasUnicos = new Set(ocorrencias.map((o) => dataLocal(o.created_at)))
    diasUnicos.add(hojeStr())
    const resultado: string[] = ['todas']
    const mesesPassados = new Set<string>()
    for (const d of Array.from(diasUnicos).sort((a, b) => b.localeCompare(a))) {
      const mes = d.slice(0, 7)
      if (mes >= mesAtual) {
        resultado.push(d)
      } else {
        if (!mesesPassados.has(mes)) {
          mesesPassados.add(mes)
          resultado.push(mes)
        }
      }
    }
    return resultado
  }, [ocorrencias])

  const ocorrenciasFiltradas = useMemo(() => ocorrencias.filter((o) => {
    if (filtroData !== 'todas') {
      const dOc = dataLocal(o.created_at)
      if (filtroData.length === 10) {
        if (dOc !== filtroData) return false
      } else {
        if (!dOc.startsWith(filtroData + '-')) return false
      }
    }
    if (filtroNivel !== 'todos' && o.nivel_risco !== filtroNivel) return false
    if (filtroStatus !== 'todos' && o.status_oc !== filtroStatus) return false
    if (buscando) {
      const b = buscando.toLowerCase()
      return o.natureza.toLowerCase().includes(b) || o.tipo.toLowerCase().includes(b) ||
        (o.endereco ?? '').toLowerCase().includes(b) || (o.proprietario ?? '').toLowerCase().includes(b)
    }
    return true
  }), [ocorrencias, filtroData, filtroNivel, filtroStatus, buscando])

  const contagens = useMemo(() => ({
    alto: ocorrencias.filter((o) => o.nivel_risco === 'alto').length,
    medio: ocorrencias.filter((o) => o.nivel_risco === 'medio').length,
    baixo: ocorrencias.filter((o) => o.nivel_risco === 'baixo').length,
    ativos: ocorrencias.filter((o) => o.status_oc === 'ativo').length,
  }), [ocorrencias])

  if (!logado) {
    return <Login onLogin={() => setLogado(true)} apenasAgente={estaLogado() && !agenteEscolhido()} />
  }

  if (aba === 'nova') {
    return (
      <Suspense fallback={<LazyFallback />}>
        <NovaOcorrencia
          onSalvo={async (ocOffline) => {
            if (ocOffline) showToast('📥 Salvo localmente. Será enviado ao reconectar.')
            await carregar()
            await atualizarPendingCount()
            setAba('lista')
          }}
          onVoltar={() => setAba('lista')}
          isOnline={isOnline}
        />
      </Suspense>
    )
  }

  return (
    <div className="app">
      <BannerInstalar />

      {!isOnline && (
        <div className="offline-banner">
          📵 Sem conexão — dados salvos localmente
        </div>
      )}

      {isOnline && pendingCount > 0 && (
        <div className="sync-banner" onClick={() => sincronizar()}>
          {sincronizando
            ? '⏳ Sincronizando...'
            : `🔄 ${pendingCount} ocorrência(s) pendente(s) — toque para sincronizar`}
        </div>
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}

      <header className="header">
        <div className="header-logo">
          <img src="/logo-dc.jpg" alt="Defesa Civil" className="logo-img" />
          <div className="header-textos">
            <span className="header-nome">Defesa Civil</span>
            <span className="header-cidade">Ouro Branco — MG</span>
          </div>
        </div>
        <div className="header-direita">
          <AgentesOnline />
          {logado && statusNotif !== 'sem-suporte' && statusNotif !== null && (
            <button
              className={`notif-bell-btn ${statusNotif === 'ativo' ? 'notif-bell-ativo' : statusNotif === 'negado' ? 'notif-bell-negado' : 'notif-bell-inativo'}`}
              title={
                statusNotif === 'ativo' ? 'Notificações de SOS ativas' :
                statusNotif === 'negado' ? 'Notificações bloqueadas — toque para ver como liberar' :
                'Toque para ativar notificações de SOS'
              }
              onClick={statusNotif !== 'ativo' ? ativarNotificacoes : undefined}
              disabled={ativandoNotif}
            >
              {statusNotif === 'ativo' ? '🔔' : statusNotif === 'negado' ? '🔕' : '🔕'}
              <span className="notif-bell-label">
                {statusNotif === 'ativo' ? 'SOS ativo' : 'Ativar SOS'}
              </span>
            </button>
          )}
          <BotaoSos modo="botao" />
        </div>
      </header>

      {logado && statusNotif !== 'ativo' && statusNotif !== 'sem-suporte' && statusNotif !== null && (
        <BannerNotifSos
          statusNotif={statusNotif}
          agente={getAgenteLogado()}
          onAtivado={async () => {
            const s = await getStatusNotificacoes()
            setStatusNotif(s)
          }}
        />
      )}

      {aba === 'lista' && (
        <div className="resumo-strip">
          <div className="resumo-item resumo-alto" onClick={() => setFiltroNivel(filtroNivel === 'alto' ? 'todos' : 'alto')}>
            <span className="resumo-num">{contagens.alto}</span>
            <span className="resumo-rotulo">Alto</span>
          </div>
          <div className="resumo-div" />
          <div className="resumo-item resumo-medio" onClick={() => setFiltroNivel(filtroNivel === 'medio' ? 'todos' : 'medio')}>
            <span className="resumo-num">{contagens.medio}</span>
            <span className="resumo-rotulo">Médio</span>
          </div>
          <div className="resumo-div" />
          <div className="resumo-item resumo-baixo" onClick={() => setFiltroNivel(filtroNivel === 'baixo' ? 'todos' : 'baixo')}>
            <span className="resumo-num">{contagens.baixo}</span>
            <span className="resumo-rotulo">Baixo</span>
          </div>
          <div className="resumo-div" />
          <div className="resumo-item resumo-total" onClick={() => { setFiltroNivel('todos'); setFiltroStatus('todos') }}>
            <span className="resumo-num">{ocorrencias.length}</span>
            <span className="resumo-rotulo">Total</span>
          </div>
        </div>
      )}

      <div className="conteudo">
        {aba === 'lista' && (
          <>
            <div className="filtros-box">
              <div className="filtros-row filtros-data-row">
                <span className="filtros-label">📅 Data:</span>
                <select
                  className="filtro-data-select"
                  value={filtroData}
                  onChange={(e) => setFiltroData(e.target.value)}
                >
                  {datasDisponiveis.map((d) => (
                    <option key={d} value={d}>{formatarItemData(d)}</option>
                  ))}
                </select>
                {filtroData !== hojeStr() && (
                  <button className="btn-hoje" onClick={() => setFiltroData(hojeStr())}>Hoje</button>
                )}
                {filtroData === 'todas' && (
                  <span style={{ fontSize: '0.72rem', color: '#6b7280', marginLeft: '0.2rem' }}>
                    ({ocorrencias.length} total)
                  </span>
                )}
              </div>
              <input
                className="busca-input"
                type="text"
                placeholder="🔍 Buscar por natureza, local ou morador..."
                value={buscando}
                onChange={(e) => setBuscando(e.target.value)}
              />
              <div className="filtros-row">
                <span className="filtros-label">Nível:</span>
                {(['todos', 'alto', 'medio', 'baixo'] as const).map((f) => (
                  <button key={f} className={`filtro-btn ${filtroNivel === f ? 'ativo' : ''} ${f !== 'todos' ? `filtro-${f}` : ''}`} onClick={() => setFiltroNivel(f)}>
                    {f === 'todos' ? 'Todos' : f === 'alto' ? 'Alto' : f === 'medio' ? 'Médio' : 'Baixo'}
                  </button>
                ))}
                <span className="filtros-label" style={{ marginLeft: '0.4rem' }}>Status:</span>
                {(['todos', 'ativo', 'resolvido'] as const).map((s) => (
                  <button key={s} className={`filtro-btn ${filtroStatus === s ? 'ativo' : ''}`} onClick={() => setFiltroStatus(s)}>
                    {s === 'todos' ? 'Todos' : s === 'ativo' ? 'Ativos' : 'Resolvidos'}
                  </button>
                ))}
              </div>
              <div className="filtros-row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="btn-excel-global" onClick={exportarExcel}>
                  📊 Excel
                </button>
                <button className="btn-kmz-global" onClick={exportarTudoKMZ}>
                  🌍 KMZ
                </button>
              </div>
            </div>

            <Suspense fallback={null}>
              <Dashboard ocorrencias={ocorrencias} />
            </Suspense>

            {carregando ? (
              <div className="carregando">⏳ Carregando ocorrências...</div>
            ) : ocorrenciasFiltradas.length === 0 ? (
              <div className="lista-vazia">
                <div style={{ fontSize: '3rem' }}>📋</div>
                <div>
                  {filtroData === hojeStr()
                    ? 'Nenhuma ocorrência registrada hoje.'
                    : filtroData === 'todas'
                    ? 'Nenhuma ocorrência registrada.'
                    : `Nenhuma ocorrência em ${formatarItemData(filtroData)}.`}
                </div>
                {filtroData === hojeStr() && (
                  <button className="btn-nova-vazia" onClick={() => setAba('nova')}>+ Registrar nova</button>
                )}
              </div>
            ) : (
              <div className="lista">
                {ocorrenciasFiltradas.map((o) => (
                  <div key={o.id} className="oc-card-wrapper">
                    <button className={`oc-card ${o._offline ? 'oc-card-offline' : ''}`} onClick={() => setSelecionada(o)}>
                      <div className="oc-card-esq">
                        <span className="oc-emoji">{NATUREZA_ICONE[o.natureza] ?? '📋'}</span>
                      </div>
                      <div className="oc-card-corpo">
                        <div className="oc-card-top">
                          <span className="oc-natureza">{o.natureza}</span>
                          {o._offline && <span className="oc-offline-tag">📵 Salvo offline</span>}
                          <span className="oc-seta">›</span>
                        </div>
                        <div className="oc-card-badges">
                          <NivelBadge nivel={o.nivel_risco} />
                          <span className={`status-badge status-${o.status_oc}`}>
                            {o.status_oc === 'ativo' ? '🔴 Ativo' : '✅ Resolvido'}
                          </span>
                        </div>
                        <div className="oc-card-meta">
                          <span>{o.tipo}</span>
                          {o.endereco && <span>📍 {o.endereco}</span>}
                          <span>🕐 {new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
                          {Array.isArray(o.agentes) && o.agentes.length > 0 && (
                            <span>👤 {o.agentes.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </button>
                    {o._offline && o._localId != null && isOnline && (
                      <button
                        className={`btn-sincronizar-item ${sincronizandoIds.has(o._localId) ? 'sincronizando' : ''}`}
                        onClick={() => sincronizarItem(o._localId!)}
                        disabled={sincronizandoIds.has(o._localId)}
                      >
                        {sincronizandoIds.has(o._localId) ? '⏳ Sincronizando...' : '☁️ Sincronizar agora'}
                      </button>
                    )}
                    {o._offline && !isOnline && (
                      <div className="btn-sincronizar-item btn-sincronizar-offline">
                        📵 Sem conexão — aguardando rede
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {aba === 'mapa' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <MapaOcorrencias
                ocorrencias={ocorrencias}
                onSelecionar={(o) => setSelecionada(o)}
                destinoExterno={destinoSos ?? destinoCampo}
                onDestinoExternoConsumido={() => { setDestinoSos(null); setDestinoCampo(null) }}
                equipamentosCampo={equipamentosCampoMapa}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {aba === 'viatura' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <ChecklistViatura />
            </Suspense>
          </ErrorBoundary>
        )}

        {aba === 'escala' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <EscalaAgentes />
            </Suspense>
          </ErrorBoundary>
        )}

        {aba === 'materiais' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <MateriaisEmprestimos onIrParaMapa={(lat, lng, nome) => {
                setDestinoCampo({ lat, lng, nome, soMostrar: true })
                setAba('mapa')
              }} />
            </Suspense>
          </ErrorBoundary>
        )}

        {aba === 'planejamento' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <Planejamento />
            </Suspense>
          </ErrorBoundary>
        )}

        {aba === 'plano_emergencia' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <PlanoEmergencia />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>

      <nav className="bottom-nav">
        <button className={`nav-btn ${aba === 'escala' ? 'ativo' : ''}`} onClick={() => setAba('escala')}>
          <span className="nav-emoji">👥</span>
          <span>Escala</span>
        </button>
        <button className={`nav-btn ${aba === 'lista' ? 'ativo' : ''}`} onClick={() => setAba('lista')}>
          <span className="nav-emoji">📋</span>
          <span>Ocorrências</span>
        </button>
        <button className="nav-btn nav-nova" onClick={() => setAba('nova')}>
          <span className="nav-nova-icone">+</span>
        </button>
        <button className={`nav-btn ${aba === 'mapa' ? 'ativo' : ''}`} onClick={() => setAba('mapa')}>
          <span className="nav-emoji">🗺️</span>
          <span>Mapa</span>
        </button>
        <button className={`nav-btn ${aba === 'planejamento' ? 'ativo' : ''}`} onClick={() => setAba('planejamento')}>
          <span className="nav-emoji">📐</span>
          <span>Planejamento</span>
        </button>
        <button className={`nav-btn ${aba === 'plano_emergencia' ? 'ativo' : ''}`} onClick={() => setAba('plano_emergencia')}>
          <span className="nav-emoji">🚨</span>
          <span>Emergência</span>
        </button>
        <button className={`nav-btn ${aba === 'viatura' ? 'ativo' : ''}`} onClick={() => setAba('viatura')}>
          <span className="nav-emoji">🚗</span>
          <span>Viatura</span>
        </button>
        <button className={`nav-btn ${aba === 'materiais' ? 'ativo' : ''}`} onClick={() => setAba('materiais')}>
          <span className="nav-emoji">📦</span>
          <span>Patrimônio</span>
        </button>
      </nav>

      {selecionada && (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <DetalheOcorrencia
              ocorrencia={selecionada}
              onFechar={() => setSelecionada(null)}
              onDeletado={() => { setSelecionada(null); carregar() }}
              onAtualizado={(atualizado) => {
                setSelecionada(atualizado)
                setOcorrencias((prev) => prev.map((o) => o.id === atualizado.id ? atualizado : o))
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Overlay de SOS recebido — visível em qualquer aba */}
      <ErrorBoundary>
        <Suspense fallback={null}>
          <SosOverlay />
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}
