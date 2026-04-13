import { useState, useEffect, useCallback } from 'react'
import './App.css'
import MapaOcorrencias from './components/MapaOcorrencias'
import NovaOcorrencia from './components/NovaOcorrencia'
import DetalheOcorrencia from './components/DetalheOcorrencia'
import JSZip from 'jszip'
import type { Ocorrencia, NivelRisco } from './types'
import { NATUREZA_ICONE } from './types'
import { listarOcorrencias, criarOcorrencia } from './api'
import { cacheOcorrencias, getCachedOcorrencias, getPending, removePending, countPending } from './offline'
import { exportarTodasExcel } from './exportExcel'

type Aba = 'lista' | 'mapa' | 'nova'

function NivelBadge({ nivel }: { nivel: NivelRisco }) {
  return (
    <span className={`nivel-badge nivel-${nivel}`}>
      {nivel === 'baixo' ? '🟢 Baixo' : nivel === 'medio' ? '🟡 Médio' : '🔴 Alto'}
    </span>
  )
}

export default function App() {
  const [aba, setAba] = useState<Aba>('lista')
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionada, setSelecionada] = useState<Ocorrencia | null>(null)
  const [filtroNivel, setFiltroNivel] = useState<NivelRisco | 'todos'>('todos')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'resolvido'>('todos')
  const [buscando, setBuscando] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)
  const [toastMsg, setToastMsg] = useState('')

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3500)
  }

  const atualizarPendingCount = useCallback(async () => {
    const n = await countPending()
    setPendingCount(n)
  }, [])

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true)
    let serverData: Ocorrencia[] = []
    if (navigator.onLine || forcar) {
      try {
        serverData = await listarOcorrencias()
        await cacheOcorrencias(serverData)
      } catch {
        serverData = await getCachedOcorrencias()
      }
    } else {
      serverData = await getCachedOcorrencias()
    }
    // Merge pending offline items at the top of the list
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
      observacoes: p.observacoes ?? null,
      data_ocorrencia: p.data_ocorrencia ?? null,
      created_at: p._savedAt ?? new Date().toISOString(),
      _offline: true,
      _localId: p.localId,
    }))
    setOcorrencias([...offlineItems, ...serverData])
    setCarregando(false)
    await atualizarPendingCount()
  }, [atualizarPendingCount])

  const sincronizar = useCallback(async () => {
    if (!navigator.onLine || sincronizando) return
    const pending = await getPending()
    if (pending.length === 0) return
    setSincronizando(true)
    showToast(`⏳ Sincronizando ${pending.length} ocorrência(s)...`)
    let ok = 0
    for (const item of pending) {
      try {
        const { localId, _savedAt, ...data } = item
        await criarOcorrencia(data)
        await removePending(localId)
        ok++
      } catch {
        // will retry next time
      }
    }
    setSincronizando(false)
    if (ok > 0) {
      showToast(`✅ ${ok} ocorrência(s) sincronizadas com sucesso!`)
      await carregar()
    }
    await atualizarPendingCount()
  }, [sincronizando, carregar, atualizarPendingCount])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true)
      setTimeout(sincronizar, 800)
    }
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
        ${o.observacoes ? `<b>Obs:</b> ${o.observacoes}<br/>` : ''}
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

  const ocorrenciasFiltradas = ocorrencias.filter((o) => {
    if (filtroNivel !== 'todos' && o.nivel_risco !== filtroNivel) return false
    if (filtroStatus !== 'todos' && o.status_oc !== filtroStatus) return false
    if (buscando) {
      const b = buscando.toLowerCase()
      return o.natureza.toLowerCase().includes(b) || o.tipo.toLowerCase().includes(b) ||
        (o.endereco ?? '').toLowerCase().includes(b) || (o.proprietario ?? '').toLowerCase().includes(b)
    }
    return true
  })

  const contagens = {
    alto: ocorrencias.filter((o) => o.nivel_risco === 'alto').length,
    medio: ocorrencias.filter((o) => o.nivel_risco === 'medio').length,
    baixo: ocorrencias.filter((o) => o.nivel_risco === 'baixo').length,
    ativos: ocorrencias.filter((o) => o.status_oc === 'ativo').length,
  }

  if (aba === 'nova') {
    return (
      <NovaOcorrencia
        onSalvo={async (ocOffline) => {
          if (ocOffline) showToast('📥 Salvo offline. Será enviado quando houver conexão.')
          else showToast('✅ Ocorrência salva com sucesso!')
          await carregar()
          await atualizarPendingCount()
          setAba('lista')
        }}
        onVoltar={() => setAba('lista')}
        isOnline={isOnline}
      />
    )
  }

  return (
    <div className="app">
      {/* Offline banner */}
      {!isOnline && (
        <div className="offline-banner">
          📵 Sem conexão — dados salvos localmente
        </div>
      )}

      {/* Sync banner */}
      {isOnline && pendingCount > 0 && (
        <div className="sync-banner" onClick={sincronizar}>
          {sincronizando
            ? '⏳ Sincronizando...'
            : `🔄 ${pendingCount} ocorrência(s) pendente(s) — toque para sincronizar`}
        </div>
      )}

      {/* Toast */}
      {toastMsg && <div className="toast">{toastMsg}</div>}

      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <img src="/logo-dc.png" alt="Defesa Civil" className="logo-img" />
          <div className="header-textos">
            <span className="header-nome">Defesa Civil</span>
            <span className="header-cidade">Ouro Branco — MG</span>
          </div>
        </div>
        <div className="header-direita">
          <div className={`header-status ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            {isOnline ? `${contagens.ativos} Ativo${contagens.ativos !== 1 ? 's' : ''}` : 'Offline'}
          </div>
        </div>
      </header>

      {/* Resumo */}
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

      {/* Conteúdo */}
      <div className="conteudo">
        {aba === 'lista' && (
          <>
            <div className="filtros-box">
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
                <button className="btn-excel-global" onClick={() => exportarTodasExcel(ocorrenciasFiltradas)}>
                  📊 Excel
                </button>
                <button className="btn-kmz-global" onClick={exportarTudoKMZ}>
                  🌍 KMZ
                </button>
              </div>
            </div>

            {carregando ? (
              <div className="carregando">⏳ Carregando ocorrências...</div>
            ) : ocorrenciasFiltradas.length === 0 ? (
              <div className="lista-vazia">
                <div style={{ fontSize: '3rem' }}>📋</div>
                <div>Nenhuma ocorrência encontrada.</div>
                <button className="btn-nova-vazia" onClick={() => setAba('nova')}>+ Registrar nova</button>
              </div>
            ) : (
              <div className="lista">
                {ocorrenciasFiltradas.map((o) => (
                  <button key={o.id} className={`oc-card ${o._offline ? 'oc-card-offline' : ''}`} onClick={() => setSelecionada(o)}>
                    <div className="oc-card-esq">
                      <span className="oc-emoji">{NATUREZA_ICONE[o.natureza] ?? '📋'}</span>
                    </div>
                    <div className="oc-card-corpo">
                      <div className="oc-card-top">
                        <span className="oc-natureza">{o.natureza}</span>
                        {o._offline && <span className="oc-offline-tag">📵</span>}
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
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {aba === 'mapa' && (
          <MapaOcorrencias
            ocorrencias={ocorrencias}
            onSelecionar={(o) => setSelecionada(o)}
          />
        )}
      </div>

      {/* Bottom nav */}
      <nav className="bottom-nav">
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
      </nav>

      {/* Modal detalhe */}
      {selecionada && (
        <DetalheOcorrencia
          ocorrencia={selecionada}
          onFechar={() => setSelecionada(null)}
          onDeletado={() => { setSelecionada(null); carregar() }}
          onAtualizado={(atualizado) => {
            setSelecionada(atualizado)
            setOcorrencias((prev) => prev.map((o) => o.id === atualizado.id ? atualizado : o))
          }}
        />
      )}
    </div>
  )
}
