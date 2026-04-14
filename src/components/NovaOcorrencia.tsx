import { useState, useRef } from 'react'
import { TIPOS_OCORRENCIA, NATUREZAS, AGENTES } from '../types'
import type { NivelRisco, StatusOc } from '../types'
import { criarOcorrencia } from '../api'
import { savePending, geocodificarEndereco } from '../offline'
import { formatarCoordenadas } from '../utils'

interface Props {
  onSalvo: (offline: boolean) => void
  onVoltar: () => void
  isOnline: boolean
}

export default function NovaOcorrencia({ onSalvo, onVoltar, isOnline }: Props) {
  const hoje = new Date().toISOString().split('T')[0]
  const [tipo, setTipo] = useState('')
  const [tipoOutro, setTipoOutro] = useState('')
  const [natureza, setNatureza] = useState('')
  const [subnatureza, setSubnatureza] = useState('')
  const [nivelRisco, setNivelRisco] = useState<NivelRisco>('baixo')
  const [statusOc, setStatusOc] = useState<StatusOc>('ativo')
  const [dataOcorrencia, setDataOcorrencia] = useState(hoje)
  const [fotos, setFotos] = useState<string[]>([])
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [endereco, setEndereco] = useState('')
  const [proprietario, setProprietario] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [agentes, setAgentes] = useState<string[]>([])
  const [buscandoGps, setBuscandoGps] = useState(false)
  const [geocodificando, setGeocodificando] = useState(false)
  const [geoMsg, setGeoMsg] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const precisaSubnatureza = natureza === 'Queda de Estrutura' || natureza === 'Apreensão e Captura de Animal'
  const labelSubnatureza = natureza === 'Queda de Estrutura' ? 'Qual é a estrutura?' : 'Qual é o animal?'

  function obterGps() {
    if (!navigator.geolocation) { setErro('Geolocalização não disponível.'); return }
    setBuscandoGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(parseFloat(pos.coords.latitude.toFixed(6)))
        setLng(parseFloat(pos.coords.longitude.toFixed(6)))
        setGeoMsg('✅ GPS obtido com sucesso!')
        setBuscandoGps(false)
      },
      () => {
        setErro('Não foi possível obter GPS. Informe o endereço e clique em "Localizar no mapa".')
        setBuscandoGps(false)
      }
    )
  }

  async function localizarEndereco() {
    if (!endereco.trim()) { setErro('Digite um endereço para localizar.'); return }
    if (!navigator.onLine) { setErro('Sem conexão. A geocodificação será feita ao salvar.'); return }
    setGeocodificando(true)
    setGeoMsg('')
    const resultado = await geocodificarEndereco(endereco)
    setGeocodificando(false)
    if (resultado) {
      setLat(resultado.lat)
      setLng(resultado.lng)
      setGeoMsg(`✅ Localizado: ${formatarCoordenadas(resultado.lat, resultado.lng)}`)
    } else {
      setGeoMsg('⚠️ Endereço não encontrado. Tente ser mais específico.')
    }
  }

  function adicionarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        if (ev.target?.result) setFotos((prev) => [...prev, ev.target!.result as string])
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

    const payload = {
      tipo: tipoFinal,
      natureza,
      subnatureza: precisaSubnatureza ? subnatureza : null,
      nivel_risco: nivelRisco,
      status_oc: statusOc,
      data_ocorrencia: dataOcorrencia || null,
      fotos,
      lat: finalLat,
      lng: finalLng,
      endereco: endereco || null,
      proprietario: proprietario || null,
      observacoes: observacoes || null,
      agentes,
    }

    if (isOnline) {
      try {
        await criarOcorrencia(payload as any)
        setSalvando(false)
        onSalvo(false)
      } catch {
        // Network failed even though we thought online — save offline
        await savePending(payload)
        setSalvando(false)
        onSalvo(true)
      }
    } else {
      // Offline: save locally
      await savePending(payload)
      setSalvando(false)
      onSalvo(true)
    }
  }

  return (
    <div className="tela">
      <header className="header">
        <button className="btn-voltar" onClick={onVoltar}>‹</button>
        <div className="header-logo-mini">
          <img src="/logo-dc.png" alt="Defesa Civil" className="logo-img-mini" />
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
            <select className="campo-select" value={tipo} onChange={(e) => { setTipo(e.target.value); setTipoOutro(''); setNatureza('') }}>
              <option value="">Selecione...</option>
              {TIPOS_OCORRENCIA.map((t) => <option key={t}>{t}</option>)}
            </select>
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
              <select className="campo-select" value={natureza} onChange={(e) => { setNatureza(e.target.value); setSubnatureza('') }}>
                <option value="">Selecione...</option>
                {NATUREZAS.map((n) => <option key={n}>{n}</option>)}
              </select>
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

          {/* 6 - Fotos */}
          <div className="campo">
            <label className="campo-label">6 — Fotos</label>
            <div className="fotos-area">
              {fotos.map((f, i) => (
                <div key={i} className="foto-wrap">
                  <img src={f} alt="" className="foto-thumb" />
                  <button className="foto-del" onClick={() => setFotos((p) => p.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="btn-add-foto" onClick={() => fileRef.current?.click()}>
                <span className="btn-foto-emoji">📷</span>
                <span>Adicionar Foto</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: 'none' }} onChange={adicionarFotos} />
            </div>
          </div>

          {/* 6 - Localização */}
          <div className="campo">
            <label className="campo-label">7 — Localização</label>

            {/* GPS */}
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
            </div>

            {/* Address + geocode button */}
            <div className="endereco-row">
              <input
                className="campo-input endereco-input"
                type="text"
                placeholder="Rua, nº, Bairro... (Ouro Branco)"
                value={endereco}
                onChange={(e) => { setEndereco(e.target.value); setGeoMsg('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') localizarEndereco() }}
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
            {geoMsg && (
              <div className={`geo-msg ${geoMsg.startsWith('✅') ? 'geo-ok' : 'geo-warn'}`}>
                {geoMsg}
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

          {/* 9 - Observações */}
          <div className="campo">
            <label className="campo-label">9 — Observações</label>
            <textarea
              className="campo-textarea"
              placeholder="Descreva detalhes da ocorrência..."
              rows={4}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>

          {/* 10 - Agentes Empenhados */}
          <div className="campo">
            <label className="campo-label">10 — Agentes Empenhados na Ocorrência</label>
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
          {salvando ? '⏳ Salvando...' : isOnline ? '💾  Salvar Ocorrência' : '📥  Salvar Offline'}
        </button>
      </div>
    </div>
  )
}
