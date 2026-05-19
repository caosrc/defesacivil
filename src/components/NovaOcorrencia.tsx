import { useState, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { TIPOS_OCORRENCIA, NATUREZAS, AGENTES } from '../types'
import type { NivelRisco, StatusOc } from '../types'
import { criarOcorrencia } from '../api'
import { geocodificarEndereco } from '../offline'
import { formatarCoordenadas, adicionarMarcaDagua, mensagemErroGps } from '../utils'
import { calcularHorasTotal, calcularHorasSobreaviso, formatarHoras, sincronizarHorasEscala } from '../horasUtils'

// Fix Leaflet default icon
;(function fixLeafletIcon() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })
})()

const OURO_BRANCO_CENTER: [number, number] = [-20.5264, -43.6947]

function MapPickerClick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng) } })
  return null
}

interface Props {
  onSalvo: (offline: boolean) => void
  onVoltar: () => void
  isOnline: boolean
}

type FocoIncendio = { lat: number | null; lng: number | null; buscando: boolean }

export default function NovaOcorrencia({ onSalvo, onVoltar, isOnline }: Props) {
  const hoje = new Date().toISOString().split('T')[0]
  const [tipo, setTipo] = useState('')
  const [tipoOutro, setTipoOutro] = useState('')
  const [natureza, setNatureza] = useState('')
  const [subnatureza, setSubnatureza] = useState('')
  const [nivelRisco, setNivelRisco] = useState<NivelRisco>('baixo')
  const [statusOc, setStatusOc] = useState<StatusOc>('ativo')
  const [dataOcorrencia, setDataOcorrencia] = useState(hoje)
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [fotoAmpliada, setFotoAmpliada] = useState<number | null>(null)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [rua, setRua] = useState('')
  const [numero, setNumero] = useState('')
  const [bairro, setBairro] = useState('')
  const endereco = [rua, numero, bairro].filter(Boolean).join(', ')
  const [proprietario, setProprietario] = useState('')
  const [situacao, setSituacao] = useState('')
  const [recomendacao, setRecomendacao] = useState('')
  const [conclusao, setConclusao] = useState('')
  const [agentes, setAgentes] = useState<string[]>(() => {
    const agenteLogado = sessionStorage.getItem('defesacivil-agente-sessao')
    return agenteLogado ? [agenteLogado] : []
  })
  const [buscandoGps, setBuscandoGps] = useState(false)
  const [geocodificando, setGeocodificando] = useState(false)
  const [geoMsg, setGeoMsg] = useState('')
  const [mostrarMapaPicker, setMostrarMapaPicker] = useState(false)
  const [latPicker, setLatPicker] = useState<number | null>(null)
  const [lngPicker, setLngPicker] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [tipoAberto, setTipoAberto] = useState(false)
  const [naturezaAberta, setNaturezaAberta] = useState(false)
  const tipoRef = useRef<HTMLDivElement>(null)
  const naturezaRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)

  // ── Focos de incêndio (apenas para Incêndio em Área Urbana/Rural) ──────────
  const [focosIncendio, setFocosIncendio] = useState<FocoIncendio[]>([{ lat: null, lng: null, buscando: false }])

  useEffect(() => {
    function fechar(e: MouseEvent) {
      if (tipoRef.current && !tipoRef.current.contains(e.target as Node)) setTipoAberto(false)
      if (naturezaRef.current && !naturezaRef.current.contains(e.target as Node)) setNaturezaAberta(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  const precisaSubnatureza = natureza === 'Queda de Estrutura' || natureza === 'Apreensão e Captura de Animal'
  const labelSubnatureza = natureza === 'Queda de Estrutura' ? 'Qual é a estrutura?' : 'Qual é o animal?'
  const ehIncendio = natureza === 'Incêndio em Área Urbana' || natureza === 'Incêndio em Área Rural'

  function obterGps() {
    if (!navigator.geolocation) { setErro('Geolocalização não disponível.'); return }
    setErro('')
    setGeoMsg('')
    setBuscandoGps(true)
    // IMPORTANTE: no iOS o getCurrentPosition deve ser chamado de forma
    // síncrona dentro do handler do gesto do usuário. Qualquer await
    // antes desta chamada faz o iOS bloquear a permissão.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(parseFloat(pos.coords.latitude.toFixed(6)))
        setLng(parseFloat(pos.coords.longitude.toFixed(6)))
        setGeoMsg('✅ GPS obtido com sucesso!')
        setErro('')
        setBuscandoGps(false)
      },
      (err) => {
        setErro(mensagemErroGps(err))
        setBuscandoGps(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    )
  }

  function obterGpsFoco(idx: number) {
    if (!navigator.geolocation) { setErro('Geolocalização não disponível.'); return }
    setErro('')
    setFocosIncendio(prev => prev.map((f, i) => i === idx ? { ...f, buscando: true } : f))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const novoLat = parseFloat(pos.coords.latitude.toFixed(6))
        const novoLng = parseFloat(pos.coords.longitude.toFixed(6))
        setFocosIncendio(prev => prev.map((f, i) => i === idx ? { lat: novoLat, lng: novoLng, buscando: false } : f))
        // Foco 1 também define a localização principal da ocorrência
        if (idx === 0) { setLat(novoLat); setLng(novoLng) }
      },
      (err) => {
        setFocosIncendio(prev => prev.map((f, i) => i === idx ? { ...f, buscando: false } : f))
        setErro(mensagemErroGps(err))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    )
  }

  function adicionarFoco() {
    setFocosIncendio(prev => [...prev, { lat: null, lng: null, buscando: false }])
  }

  function removerFoco(idx: number) {
    setFocosIncendio(prev => prev.filter((_, i) => i !== idx))
  }

  async function localizarEndereco() {
    if (!endereco.trim()) { setErro('Digite um endereço para localizar.'); return }
    setGeocodificando(true)
    setGeoMsg('')
    const resultado = await geocodificarEndereco(endereco)
    setGeocodificando(false)
    if (resultado) {
      setLat(resultado.lat)
      setLng(resultado.lng)
      const origem = navigator.onLine ? '' : ' (referência offline)'
      setGeoMsg(`✅ Localizado${origem}: ${formatarCoordenadas(resultado.lat, resultado.lng)}`)
    } else {
      setGeoMsg(navigator.onLine
        ? '⚠️ Endereço não encontrado. Tente ser mais específico.'
        : '⚠️ Sem conexão. Use o GPS ou tente novamente com sinal.')
    }
  }

  function adicionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        if (ev.target?.result) {
          const comMarca = await adicionarMarcaDagua(ev.target.result as string, lat, lng)
          setFotos((prev) => [...prev, comMarca])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  async function salvar() {
    if (!tipo) { setErro('Selecione o tipo de ocorrência.'); return }
    if (!natureza) { setErro('Selecione a natureza da ocorrência.'); return }
    if (precisaSubnatureza && !subnatureza.trim()) {
      setErro(`Informe: ${labelSubnatureza}`)
      return
    }
    if (!lat && !endereco.trim()) {
      setErro('Informe a localização (GPS ou endereço).')
      return
    }
    setErro('')
    setSalvando(true)

    // If address provided but no GPS yet, try to geocode now
    let finalLat = lat
    let finalLng = lng
    if (!finalLat && endereco.trim() && navigator.onLine) {
      const geo = await geocodificarEndereco(endereco)
      if (geo) { finalLat = geo.lat; finalLng = geo.lng }
    }

    const tipoFinal = tipo === 'Outro' ? (tipoOutro.trim() || 'Outro') : tipo

    // Monta lista de focos válidos (com coordenadas) para incêndios
    const focosValidos = ehIncendio
      ? focosIncendio.filter(f => f.lat != null && f.lng != null).map(f => ({ lat: f.lat!, lng: f.lng! }))
      : null

    const horasTotal = (horaInicio && horaFim) ? calcularHorasTotal(horaInicio, horaFim) : null
    const horasSobreaviso = (horaInicio && horaFim && dataOcorrencia)
      ? calcularHorasSobreaviso(dataOcorrencia, horaInicio, horaFim)
      : null

    const payload = {
      tipo: tipoFinal,
      natureza,
      subnatureza: precisaSubnatureza ? subnatureza : null,
      nivel_risco: nivelRisco,
      status_oc: statusOc,
      data_ocorrencia: dataOcorrencia || null,
      hora_inicio: horaInicio || null,
      hora_fim: horaFim || null,
      horas_total: horasTotal,
      horas_sobreaviso: horasSobreaviso,
      fotos,
      lat: finalLat,
      lng: finalLng,
      endereco: endereco || null,
      proprietario: proprietario || null,
      situacao: situacao || null,
      recomendacao: recomendacao || null,
      conclusao: conclusao || null,
      agentes,
      responsavel_registro: sessionStorage.getItem('defesacivil-agente-sessao') || null,
      focos_incendio: focosValidos && focosValidos.length > 0 ? focosValidos : null,
    }

    try {
      const resultado = await criarOcorrencia(payload as any)
      setSalvando(false)
      const foiOffline = !!(resultado as any)._offline

      // Atualiza banco de horas dos agentes se houver horas de sobreaviso
      if (!foiOffline && horasSobreaviso && horasSobreaviso > 0 && agentes.length > 0 && dataOcorrencia) {
        sincronizarHorasEscala({
          agentes,
          dataStr: dataOcorrencia,
          horasSobreaviso,
          ocId: (resultado as any).id ?? 'novo',
          natureza,
        }).catch(() => {})
      }

      onSalvo(foiOffline)
    } catch (e: any) {
      setSalvando(false)
      setErro(`Erro ao salvar: ${e?.message ?? 'tente novamente'}`)
    }
  }

  return (
    <div className="tela">
      <header className="header">
        <button className="btn-voltar" onClick={onVoltar}>‹</button>
        <div className="header-logo-mini">
          <img src="/logo-dc.jpg" alt="Defesa Civil" className="logo-img-mini" />
          <span className="header-titulo-texto">Nova Ocorrência</span>
        </div>
        <div style={{ width: 36 }}>
          {!isOnline && <span title="Sem conexão — salvo localmente" style={{ fontSize: '1.2rem' }}>📵</span>}
        </div>
      </header>

      {!isOnline && (
        <div className="offline-banner">
          📵 Sem conexão — a ocorrência será salva localmente
        </div>
      )}

      <div className="form-scroll">
        <div className="form-card">
          <h2 className="form-titulo">Registrar Ocorrência</h2>

          {/* 1 - Tipo */}
          <div className="campo">
            <label className="campo-label">1 — Tipo de Ocorrência</label>
            <div className="campo-dropdown" ref={tipoRef}>
              <button
                type="button"
                className={`campo-dropdown-trigger ${tipo ? 'selecionado' : ''} ${tipoAberto ? 'aberto' : ''}`}
                onClick={() => setTipoAberto(v => !v)}
              >
                <span>{tipo || 'Selecione o tipo...'}</span>
                <span className="campo-dropdown-chevron">{tipoAberto ? '▲' : '▼'}</span>
              </button>
              {tipoAberto && (
                <div className="campo-dropdown-lista">
                  {TIPOS_OCORRENCIA.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`campo-dropdown-item ${tipo === t ? 'ativo' : ''}`}
                      onClick={() => { setTipo(t); setTipoOutro(''); setNatureza(''); setTipoAberto(false) }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tipo === 'Outro' && (
              <input
                className="campo-input"
                style={{ marginTop: '0.5rem' }}
                type="text"
                placeholder="Descreva o tipo de ocorrência..."
                value={tipoOutro}
                onChange={(e) => setTipoOutro(e.target.value)}
              />
            )}
          </div>

          {/* 2 - Natureza */}
          {tipo && (
            <div className="campo campo-animado">
              <label className="campo-label">2 — Natureza da Ocorrência</label>
              <div className="campo-dropdown" ref={naturezaRef}>
                <button
                  type="button"
                  className={`campo-dropdown-trigger ${natureza ? 'selecionado' : ''} ${naturezaAberta ? 'aberto' : ''}`}
                  onClick={() => setNaturezaAberta(v => !v)}
                >
                  <span>{natureza || 'Selecione a natureza...'}</span>
                  <span className="campo-dropdown-chevron">{naturezaAberta ? '▲' : '▼'}</span>
                </button>
                {naturezaAberta && (
                  <div className="campo-dropdown-lista">
                    {NATUREZAS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`campo-dropdown-item ${natureza === n ? 'ativo' : ''}`}
                        onClick={() => { setNatureza(n); setSubnatureza(''); setNaturezaAberta(false) }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2b - Subnatureza condicional */}
          {precisaSubnatureza && (
            <div className="campo campo-animado campo-sub">
              <label className="campo-label campo-label-sub">↳ {labelSubnatureza}</label>
              <input
                className="campo-input"
                type="text"
                placeholder={natureza === 'Queda de Estrutura' ? 'Ex: muro, teto, parede...' : 'Ex: cachorro, capivara...'}
                value={subnatureza}
                onChange={(e) => setSubnatureza(e.target.value)}
              />
            </div>
          )}

          {/* 3 - Nível de Risco */}
          <div className="campo">
            <label className="campo-label">3 — Nível de Risco</label>
            <div className="toggle-group">
              {(['baixo', 'medio', 'alto'] as NivelRisco[]).map((n) => (
                <button
                  key={n}
                  className={`toggle-btn toggle-${n} ${nivelRisco === n ? 'ativo' : ''}`}
                  onClick={() => setNivelRisco(n)}
                >
                  {n === 'baixo' ? 'Baixo' : n === 'medio' ? 'Médio' : 'Alto'}
                </button>
              ))}
            </div>
          </div>

          {/* 4 - Status */}
          <div className="campo">
            <label className="campo-label">4 — Status</label>
            <div className="toggle-group">
              {(['ativo', 'resolvido'] as StatusOc[]).map((s) => (
                <button
                  key={s}
                  className={`toggle-btn toggle-status-${s} ${statusOc === s ? 'ativo' : ''}`}
                  onClick={() => setStatusOc(s)}
                >
                  {s === 'ativo' ? 'Ativo' : 'Resolvido'}
                </button>
              ))}
            </div>
          </div>

          {/* 5 - Data da ocorrência */}
          <div className="campo">
            <label className="campo-label">5 — Data da Ocorrência</label>
            <input
              className="campo-input"
              type="date"
              value={dataOcorrencia}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setDataOcorrencia(e.target.value)}
            />
          </div>

          {/* 5b - Horário inicial e final */}
          <div className="campo">
            <label className="campo-label">5b — Horário da Ocorrência</label>
            <div className="horario-row">
              <div className="horario-item">
                <label className="horario-sublabel">Início</label>
                <input
                  className="campo-input"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </div>
              <div className="horario-item">
                <label className="horario-sublabel">Fim</label>
                <input
                  className="campo-input"
                  type="time"
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                />
              </div>
            </div>
            {horaInicio && horaFim && (() => {
              const total = calcularHorasTotal(horaInicio, horaFim)
              const sobreaviso = calcularHorasSobreaviso(dataOcorrencia, horaInicio, horaFim)
              return (
                <div className="horario-resumo">
                  <span className="horario-total">⏱ Total: <strong>{formatarHoras(total)}</strong></span>
                  {sobreaviso > 0
                    ? <span className="horario-sobreaviso">🌙 Sobreaviso: <strong>{formatarHoras(sobreaviso)}</strong></span>
                    : <span className="horario-sem-sobreaviso">☀️ Sem horas de sobreaviso (horário comercial)</span>
                  }
                </div>
              )
            })()}
            <div className="geo-dica">💡 Horas entre 17h e 7h entram no banco de horas. Das 7h às 17h não contam.</div>
          </div>

          {/* 6 - Fotos */}
          <div className="campo">
            <label className="campo-label">6 — Fotos</label>
            <div className="fotos-area">
              {fotos.map((f, i) => (
                <div key={i} className="foto-wrap" onClick={() => setFotoAmpliada(i)}>
                  <img src={f} alt={`Foto ${i + 1}`} className="foto-thumb" />
                  <button
                    className="foto-del"
                    onClick={(e) => { e.stopPropagation(); setFotos((p) => p.filter((_, j) => j !== i)) }}
                  >✕</button>
                </div>
              ))}
            </div>

            {fotoAmpliada !== null && (
              <div className="foto-lightbox" onClick={() => setFotoAmpliada(null)}>
                <button className="foto-lightbox-fechar" onClick={() => setFotoAmpliada(null)}>✕</button>
                {fotos.length > 1 && (
                  <button
                    className="foto-lightbox-nav foto-lightbox-nav--prev"
                    onClick={(e) => { e.stopPropagation(); setFotoAmpliada((i) => (i! - 1 + fotos.length) % fotos.length) }}
                  >‹</button>
                )}
                <img
                  src={fotos[fotoAmpliada]}
                  alt={`Foto ${fotoAmpliada + 1}`}
                  onClick={(e) => e.stopPropagation()}
                />
                {fotos.length > 1 && (
                  <button
                    className="foto-lightbox-nav foto-lightbox-nav--next"
                    onClick={(e) => { e.stopPropagation(); setFotoAmpliada((i) => (i! + 1) % fotos.length) }}
                  >›</button>
                )}
                {fotos.length > 1 && (
                  <div className="foto-lightbox-contador">{fotoAmpliada + 1} / {fotos.length}</div>
                )}
              </div>
            )}
            <div className="fotos-botoes">
              <button className="btn-foto-camera" onClick={() => cameraRef.current?.click()}>
                <span>📷</span>
                <span>Tirar Foto</span>
              </button>
              <button className="btn-foto-galeria" onClick={() => galeriaRef.current?.click()}>
                <span>🖼️</span>
                <span>Carregar Foto</span>
              </button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={adicionarFotos} />
            <input ref={galeriaRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={adicionarFotos} />
          </div>

          {/* 6 - Localização */}
          <div className="campo">
            <label className="campo-label">7 — Localização</label>

            {/* Focos de Incêndio — seção condicional */}
            {ehIncendio && (
              <div className="focos-incendio-section">
                <div className="focos-incendio-titulo">🔥 Focos de Incêndio</div>
                {focosIncendio.map((foco, idx) => (
                  <div key={idx} className="foco-row">
                    <div className="foco-header">
                      <span className="foco-label">Foco {idx + 1}</span>
                      {idx > 0 && (
                        <button
                          type="button"
                          className="btn-remover-foco"
                          onClick={() => removerFoco(idx)}
                          title="Remover foco"
                        >✕</button>
                      )}
                    </div>
                    <div className="gps-row">
                      <div className="gps-info">
                        <span>📍</span>
                        {foco.lat != null
                          ? <span className="gps-val">{formatarCoordenadas(foco.lat, foco.lng)}</span>
                          : <span className="gps-vazio">Sem GPS</span>}
                      </div>
                      <button
                        type="button"
                        className="btn-gps"
                        onClick={() => obterGpsFoco(idx)}
                        disabled={foco.buscando}
                      >
                        {foco.buscando ? '⏳' : 'Obter GPS'}
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn-adicionar-foco" onClick={adicionarFoco}>
                  + Foco
                </button>
              </div>
            )}

            {/* GPS principal (exibido apenas quando não é incêndio, ou como fallback) */}
            {!ehIncendio && (
              <div className="gps-row">
                <div className="gps-info">
                  <span>📍</span>
                  {lat
                    ? <span className="gps-val">{formatarCoordenadas(lat, lng)}</span>
                    : <span className="gps-vazio">Sem GPS</span>}
                </div>
                <button className="btn-gps" onClick={obterGps} disabled={buscandoGps}>
                  {buscandoGps ? '⏳' : 'Obter GPS'}
                </button>
                <button
                  className="btn-gps"
                  style={{ background: '#1a4b8c', color: 'white', borderColor: '#1a4b8c' }}
                  onClick={() => { setLatPicker(lat); setLngPicker(lng); setMostrarMapaPicker(true) }}
                  type="button"
                >
                  🗺️ Abrir Mapa
                </button>
              </div>
            )}

            {/* Address + geocode button */}
            <div className="endereco-campos">
              <div className="endereco-rua-row">
                <input
                  className="campo-input"
                  type="text"
                  placeholder="Rua / Logradouro"
                  value={rua}
                  onChange={(e) => { setRua(e.target.value); setGeoMsg('') }}
                />
                <button
                  className="btn-geocode"
                  onClick={localizarEndereco}
                  disabled={geocodificando || !endereco.trim()}
                  title="Localizar endereço no mapa"
                >
                  {geocodificando ? '⏳' : '🗺️'}
                </button>
              </div>
              <div className="endereco-num-bairro-row">
                <input
                  className="campo-input endereco-num"
                  type="text"
                  placeholder="Nº"
                  value={numero}
                  onChange={(e) => { setNumero(e.target.value); setGeoMsg('') }}
                />
                <input
                  className="campo-input endereco-bairro"
                  type="text"
                  placeholder="Bairro"
                  value={bairro}
                  onChange={(e) => { setBairro(e.target.value); setGeoMsg('') }}
                />
              </div>
            </div>
            {geoMsg && (
              <div className={`geo-msg ${geoMsg.startsWith('✅') ? 'geo-ok' : 'geo-warn'}`}>
                {geoMsg}
              </div>
            )}
            {erro.includes('GPS') && (
              <div className="gps-permissao-dica">
                No celular: toque no cadeado/ícone do site, abra Permissões, marque Localização como Permitir e depois toque em “Obter GPS” novamente.
              </div>
            )}
            <div className="geo-dica">
              💡 Digite o endereço e toque em 🗺️ para marcar no mapa automaticamente
            </div>
          </div>

          {/* 7 - Proprietário */}
          <div className="campo">
            <label className="campo-label">8 — Proprietário / Morador</label>
            <input
              className="campo-input"
              type="text"
              placeholder="Nome completo"
              value={proprietario}
              onChange={(e) => setProprietario(e.target.value)}
            />
          </div>

          {/* 9 - Situação */}
          <div className="campo">
            <label className="campo-label">9 — Situação</label>
            <textarea
              className="campo-textarea"
              placeholder="Descreva a situação da ocorrência..."
              rows={4}
              value={situacao}
              onChange={(e) => setSituacao(e.target.value)}
            />
          </div>

          {/* 10 - Recomendação */}
          <div className="campo">
            <label className="campo-label">10 — Recomendação</label>
            <textarea
              className="campo-textarea"
              placeholder="Descreva a recomendação..."
              rows={4}
              value={recomendacao}
              onChange={(e) => setRecomendacao(e.target.value)}
            />
          </div>

          {/* 11 - Conclusão */}
          <div className="campo">
            <label className="campo-label">11 — Conclusão</label>
            <textarea
              className="campo-textarea"
              placeholder="Descreva a conclusão..."
              rows={4}
              value={conclusao}
              onChange={(e) => setConclusao(e.target.value)}
            />
          </div>

          {/* 12 - Agentes Empenhados */}
          <div className="campo">
            <label className="campo-label">12 — Agentes Empenhados na Ocorrência</label>
            <div className="agentes-lista">
              {AGENTES.map((nome) => (
                <label key={nome} className="agente-item">
                  <input
                    type="checkbox"
                    className="agente-checkbox"
                    checked={agentes.includes(nome)}
                    onChange={(e) => {
                      if (e.target.checked) setAgentes((p) => [...p, nome])
                      else setAgentes((p) => p.filter((a) => a !== nome))
                    }}
                  />
                  <span className="agente-nome">{nome}</span>
                </label>
              ))}
            </div>
          </div>

          {erro && <div className="erro-msg">⚠️ {erro}</div>}
        </div>
      </div>

      <div className="footer-fixo">
        <button className="btn-salvar" onClick={salvar} disabled={salvando}>
          {salvando ? '⏳ Salvando...' : '💾  Salvar Ocorrência'}
        </button>
      </div>

      {/* ── Modal de seleção de localização no mapa ── */}
      {mostrarMapaPicker && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ background: '#1a4b8c', color: 'white', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.1rem' }}>🗺️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Selecionar localização</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>Toque no mapa para marcar o ponto</div>
            </div>
            <button
              onClick={() => setMostrarMapaPicker(false)}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 8, padding: '0.3rem 0.7rem', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}
            >✕</button>
          </div>

          {latPicker !== null && (
            <div style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem' }}>📍</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534', flex: 1 }}>
                {latPicker?.toFixed(6)}, {lngPicker?.toFixed(6)}
              </span>
              <button
                onClick={() => {
                  setLat(latPicker)
                  setLng(lngPicker)
                  setGeoMsg('✅ Localização definida pelo mapa')
                  setMostrarMapaPicker(false)
                }}
                style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: '0.4rem 1rem', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                ✅ Confirmar
              </button>
            </div>
          )}

          <div style={{ flex: 1, position: 'relative' }}>
            <MapContainer
              center={latPicker && lngPicker ? [latPicker, lngPicker] : OURO_BRANCO_CENTER}
              zoom={latPicker ? 16 : 14}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapPickerClick onPick={(lt, lg) => { setLatPicker(lt); setLngPicker(lg) }} />
              {latPicker !== null && lngPicker !== null && (
                <Marker position={[latPicker, lngPicker]} />
              )}
            </MapContainer>
          </div>

          {latPicker === null && (
            <div style={{ background: '#fef3c7', padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: '#92400e' }}>
              👆 Toque no mapa para definir a localização
            </div>
          )}
        </div>
      )}
    </div>
  )
}
