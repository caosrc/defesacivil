import { useState } from 'react'
import JSZip from 'jszip'
import type { Ocorrencia, NivelRisco, StatusOc } from '../types'
import { NATUREZA_ICONE, NATUREZA_COR, TIPOS_OCORRENCIA, NATUREZAS } from '../types'
import { deletarOcorrencia, atualizarOcorrencia } from '../api'
import { geocodificarEndereco, updatePending } from '../offline'
import { exportarOcorrenciaExcel } from '../exportExcel'

interface Props {
  ocorrencia: Ocorrencia
  onFechar: () => void
  onDeletado: () => void
  onAtualizado: (o: Ocorrencia) => void
}

export default function DetalheOcorrencia({ ocorrencia: oc, onFechar, onDeletado, onAtualizado }: Props) {
  const [o, setO] = useState<Ocorrencia>(oc)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [geocodificando, setGeocodificando] = useState(false)
  const [geoMsg, setGeoMsg] = useState('')
  const [erroEdit, setErroEdit] = useState('')
  const [fotoAmpliada, setFotoAmpliada] = useState<number | null>(null)

  // Detecta se o tipo salvo é um valor personalizado ("Outro")
  const tipoEhOutro = !TIPOS_OCORRENCIA.includes(o.tipo) || o.tipo === 'Outro'

  const [eTipo, setETipo] = useState(tipoEhOutro ? 'Outro' : o.tipo)
  const [eTipoOutro, setETipoOutro] = useState(tipoEhOutro && o.tipo !== 'Outro' ? o.tipo : '')
  const [eNatureza, setENatureza] = useState(o.natureza)
  const [eSubnatureza, setESubnatureza] = useState(o.subnatureza ?? '')
  const [eNivel, setENivel] = useState<NivelRisco>(o.nivel_risco)
  const [eStatus, setEStatus] = useState<StatusOc>(o.status_oc)
  const [eDataOcorrencia, setEDataOcorrencia] = useState(o.data_ocorrencia ?? '')
  const [eEndereco, setEEndereco] = useState(o.endereco ?? '')
  const [eLat, setELat] = useState<number | null>(o.lat)
  const [eLng, setELng] = useState<number | null>(o.lng)
  const [eProprietario, setEProprietario] = useState(o.proprietario ?? '')
  const [eObservacoes, setEObservacoes] = useState(o.observacoes ?? '')

  const precisaSubnatureza = eNatureza === 'Queda de Estrutura' || eNatureza === 'Apreensão e Captura de Animal'
  const labelSubnatureza = eNatureza === 'Queda de Estrutura' ? 'Qual é a estrutura?' : 'Qual é o animal?'
  const icone = NATUREZA_ICONE[o.natureza] ?? '📋'
  const cor = NATUREZA_COR[o.natureza] ?? '#1a4b8c'
  const dataFormatada = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : ''

  function iniciarEdicao() {
    const eh = !TIPOS_OCORRENCIA.includes(o.tipo) || o.tipo === 'Outro'
    setETipo(eh ? 'Outro' : o.tipo)
    setETipoOutro(eh && o.tipo !== 'Outro' ? o.tipo : '')
    setENatureza(o.natureza)
    setESubnatureza(o.subnatureza ?? '')
    setENivel(o.nivel_risco)
    setEStatus(o.status_oc)
    setEDataOcorrencia(o.data_ocorrencia ?? '')
    setEEndereco(o.endereco ?? '')
    setELat(o.lat)
    setELng(o.lng)
    setEProprietario(o.proprietario ?? '')
    setEObservacoes(o.observacoes ?? '')
    setGeoMsg('')
    setErroEdit('')
    setEditando(true)
  }

  function cancelarEdicao() {
    setEditando(false)
    setGeoMsg('')
    setErroEdit('')
  }

  async function localizarEndereco() {
    if (!eEndereco.trim()) return
    setGeocodificando(true)
    setGeoMsg('')
    const res = await geocodificarEndereco(eEndereco)
    setGeocodificando(false)
    if (res) {
      setELat(res.lat)
      setELng(res.lng)
      setGeoMsg(`✅ Lat ${res.lat.toFixed(4)}, Lng ${res.lng.toFixed(4)}`)
    } else {
      setGeoMsg('⚠️ Endereço não encontrado')
    }
  }

  async function salvarEdicao() {
    const tipoFinal = eTipo === 'Outro' ? (eTipoOutro.trim() || 'Outro') : eTipo
    if (!tipoFinal) { setErroEdit('Selecione o tipo.'); return }
    if (!eNatureza) { setErroEdit('Selecione a natureza.'); return }

    let finalLat = eLat
    let finalLng = eLng
    if (!finalLat && eEndereco.trim() && navigator.onLine) {
      const geo = await geocodificarEndereco(eEndereco)
      if (geo) { finalLat = geo.lat; finalLng = geo.lng }
    }

    setSalvando(true)
    setErroEdit('')
    try {
      const dadosEditados = {
        tipo: tipoFinal,
        natureza: eNatureza,
        subnatureza: precisaSubnatureza ? eSubnatureza || null : null,
        nivel_risco: eNivel,
        status_oc: eStatus,
        data_ocorrencia: eDataOcorrencia || null,
        fotos: o.fotos,
        lat: finalLat,
        lng: finalLng,
        endereco: eEndereco || null,
        proprietario: eProprietario || null,
        observacoes: eObservacoes || null,
      }
      let atualizado: Ocorrencia
      if (o._offline && o._localId != null) {
        await updatePending(o._localId, dadosEditados)
        atualizado = { ...o, ...dadosEditados }
      } else {
        atualizado = await atualizarOcorrencia(o.id, dadosEditados)
      }
      setO(atualizado)
      onAtualizado(atualizado)
      setEditando(false)
    } catch (err) {
      console.error(err)
      setErroEdit('Erro ao salvar. Tente novamente.')
    }
    setSalvando(false)
  }

  async function exportarKMZ() {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Defesa Civil Ouro Branco — Ocorrência #${o.id}</name>
    <Placemark>
      <name>${o.natureza}</name>
      <description><![CDATA[
        <b>Tipo:</b> ${o.tipo}<br/>
        <b>Natureza:</b> ${o.natureza}${o.subnatureza ? ` (${o.subnatureza})` : ''}<br/>
        <b>Nível de Risco:</b> ${o.nivel_risco}<br/>
        <b>Status:</b> ${o.status_oc}<br/>
        ${o.endereco ? `<b>Endereço:</b> ${o.endereco}<br/>` : ''}
        ${o.proprietario ? `<b>Proprietário:</b> ${o.proprietario}<br/>` : ''}
        ${o.observacoes ? `<b>Observações:</b> ${o.observacoes}<br/>` : ''}
        <b>Data:</b> ${dataFormatada}
      ]]></description>
      ${o.lat && o.lng ? `<Point><coordinates>${o.lng},${o.lat},0</coordinates></Point>` : ''}
    </Placemark>
  </Document>
</kml>`
    const zip = new JSZip()
    zip.file('ocorrencia.kml', kml)
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ocorrencia_${o.id}.kmz`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function confirmarDelete() {
    if (!confirm(`Excluir ocorrência #${o.id}? Esta ação não pode ser desfeita.`)) return
    await deletarOcorrencia(o.id)
    onDeletado()
  }

  const totalFotos = o.fotos?.length ?? 0

  return (
    <>
      <div className="modal-overlay" onClick={editando ? undefined : onFechar}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>

          {/* ── Header ── */}
          <div className="modal-header" style={{ background: cor }}>
            <div className="modal-titulo">
              <span className="modal-icone">{icone}</span>
              <div>
                <div className="modal-natureza">{o.natureza}</div>
                <div className="modal-tipo">{o.tipo} — #{o.id}</div>
              </div>
            </div>
            <div className="modal-header-acoes">
              {!editando && (
                <button className="btn-editar-header" onClick={iniciarEdicao} title="Editar ocorrência">
                  ✏️
                </button>
              )}
              <button className="btn-fechar" onClick={editando ? cancelarEdicao : onFechar}>✕</button>
            </div>
          </div>

          {/* ── Corpo ── */}
          <div className="modal-corpo">

            {!editando ? (
              <>
                <div className="info-badges">
                  <span className={`nivel-badge nivel-${o.nivel_risco}`}>
                    {o.nivel_risco === 'baixo' ? '🟢 Baixo' : o.nivel_risco === 'medio' ? '🟡 Médio' : '🔴 Alto'}
                  </span>
                  <span className={`status-badge status-${o.status_oc}`}>
                    {o.status_oc === 'ativo' ? '🔴 Ativo' : '✅ Resolvido'}
                  </span>
                </div>

                {o.subnatureza && <InfoRow icone="↳" label="Detalhe" valor={o.subnatureza} />}

                {o.data_ocorrencia && (
                  <InfoRow icone="📅" label="Data da Ocorrência"
                    valor={new Date(o.data_ocorrencia + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  />
                )}

                {(o.lat && o.lng) && (
                  <InfoRow icone="🛰️" label="Coordenadas GPS" valor={`Lat: ${o.lat}, Lng: ${o.lng}`} />
                )}
                {o.endereco && (
                  <InfoRow icone="📍" label="Endereço" valor={o.endereco} />
                )}
                {!o.lat && !o.lng && !o.endereco && (
                  <InfoRow icone="📍" label="Localização" valor="Não informada" />
                )}

                {o.proprietario && <InfoRow icone="👤" label="Proprietário / Morador" valor={o.proprietario} />}
                {o.observacoes && <InfoRow icone="📝" label="Observações" valor={o.observacoes} />}
                <InfoRow icone="🕐" label="Registrado em" valor={dataFormatada} />

                {totalFotos > 0 && (
                  <div className="fotos-detalhe">
                    <div className="detalhe-label-row">🖼️ Fotos ({totalFotos}) — toque para ampliar</div>
                    <div className="fotos-grid">
                      {o.fotos.map((f, i) => (
                        <button
                          key={i}
                          className="foto-btn"
                          onClick={() => setFotoAmpliada(i)}
                          title="Ampliar foto"
                        >
                          <img src={f} alt={`Foto ${i + 1}`} className="foto-detalhe" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="edit-form">
                <div className="edit-secao-titulo">✏️ Editar Ocorrência</div>

                {/* Tipo */}
                <div className="campo campo-edit">
                  <label className="campo-label">Tipo</label>
                  <select className="campo-select" value={eTipo} onChange={(e) => { setETipo(e.target.value); setETipoOutro('') }}>
                    {TIPOS_OCORRENCIA.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  {eTipo === 'Outro' && (
                    <input
                      className="campo-input"
                      style={{ marginTop: '0.5rem' }}
                      type="text"
                      placeholder="Descreva o tipo de ocorrência..."
                      value={eTipoOutro}
                      onChange={(e) => setETipoOutro(e.target.value)}
                    />
                  )}
                </div>

                {/* Natureza */}
                <div className="campo campo-edit">
                  <label className="campo-label">Natureza</label>
                  <select className="campo-select" value={eNatureza} onChange={(e) => { setENatureza(e.target.value); setESubnatureza('') }}>
                    {NATUREZAS.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </div>

                {precisaSubnatureza && (
                  <div className="campo campo-edit campo-sub">
                    <label className="campo-label campo-label-sub">↳ {labelSubnatureza}</label>
                    <input className="campo-input" type="text" value={eSubnatureza} onChange={(e) => setESubnatureza(e.target.value)} />
                  </div>
                )}

                {/* Nível de risco */}
                <div className="campo campo-edit">
                  <label className="campo-label">Nível de Risco</label>
                  <div className="toggle-group">
                    {(['baixo', 'medio', 'alto'] as NivelRisco[]).map((n) => (
                      <button key={n} className={`toggle-btn toggle-${n} ${eNivel === n ? 'ativo' : ''}`} onClick={() => setENivel(n)}>
                        {n === 'baixo' ? 'Baixo' : n === 'medio' ? 'Médio' : 'Alto'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div className="campo campo-edit">
                  <label className="campo-label">Status</label>
                  <div className="toggle-group">
                    {(['ativo', 'resolvido'] as StatusOc[]).map((s) => (
                      <button key={s} className={`toggle-btn toggle-status-${s} ${eStatus === s ? 'ativo' : ''}`} onClick={() => setEStatus(s)}>
                        {s === 'ativo' ? 'Ativo' : 'Resolvido'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data da Ocorrência */}
                <div className="campo campo-edit">
                  <label className="campo-label">📅 Data da Ocorrência</label>
                  <input
                    className="campo-input"
                    type="date"
                    value={eDataOcorrencia}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setEDataOcorrencia(e.target.value)}
                  />
                </div>

                {/* Endereço */}
                <div className="campo campo-edit">
                  <label className="campo-label">📍 Endereço</label>
                  <div className="endereco-row">
                    <input
                      className="campo-input endereco-input"
                      type="text"
                      placeholder="Rua, nº, Bairro..."
                      value={eEndereco}
                      onChange={(e) => { setEEndereco(e.target.value); setGeoMsg('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') localizarEndereco() }}
                    />
                    <button className="btn-geocode" onClick={localizarEndereco} disabled={geocodificando || !eEndereco.trim()} title="Localizar no mapa">
                      {geocodificando ? '⏳' : '🗺️'}
                    </button>
                  </div>
                  {geoMsg && (
                    <div className={`geo-msg ${geoMsg.startsWith('✅') ? 'geo-ok' : 'geo-warn'}`}>{geoMsg}</div>
                  )}
                </div>

                {/* Coordenadas GPS */}
                <div className="campo campo-edit">
                  <label className="campo-label">🛰️ Coordenadas GPS</label>
                  <div className="gps-edit-row">
                    <input
                      className="campo-input"
                      type="number"
                      step="any"
                      placeholder="Latitude"
                      value={eLat ?? ''}
                      onChange={(e) => setELat(e.target.value ? parseFloat(e.target.value) : null)}
                      style={{ flex: 1 }}
                    />
                    <input
                      className="campo-input"
                      type="number"
                      step="any"
                      placeholder="Longitude"
                      value={eLng ?? ''}
                      onChange={(e) => setELng(e.target.value ? parseFloat(e.target.value) : null)}
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn-gps"
                      title="Obter GPS atual"
                      onClick={() => {
                        navigator.geolocation?.getCurrentPosition((p) => {
                          setELat(parseFloat(p.coords.latitude.toFixed(6)))
                          setELng(parseFloat(p.coords.longitude.toFixed(6)))
                          setGeoMsg('✅ GPS atualizado!')
                        })
                      }}
                    >
                      📍
                    </button>
                  </div>
                </div>

                {/* Proprietário */}
                <div className="campo campo-edit">
                  <label className="campo-label">👤 Proprietário / Morador</label>
                  <input
                    className="campo-input"
                    type="text"
                    placeholder="Nome completo"
                    value={eProprietario}
                    onChange={(e) => setEProprietario(e.target.value)}
                  />
                </div>

                {/* Observações */}
                <div className="campo campo-edit">
                  <label className="campo-label">📝 Observações</label>
                  <textarea
                    className="campo-textarea"
                    rows={3}
                    placeholder="Detalhes da ocorrência..."
                    value={eObservacoes}
                    onChange={(e) => setEObservacoes(e.target.value)}
                  />
                </div>

                {erroEdit && <div className="erro-msg">⚠️ {erroEdit}</div>}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="modal-footer">
            {!editando ? (
              <>
                <button className="btn-editar" onClick={iniciarEdicao}>✏️ Editar</button>
                <button className="btn-excel" onClick={() => exportarOcorrenciaExcel(o)}>📊 Excel</button>
                <button className="btn-kmz" onClick={exportarKMZ}>🌍 KMZ</button>
                <button className="btn-deletar" onClick={confirmarDelete}>🗑️</button>
              </>
            ) : (
              <>
                <button className="btn-cancelar-edit" onClick={cancelarEdicao}>Cancelar</button>
                <button className="btn-salvar-edit" onClick={salvarEdicao} disabled={salvando}>
                  {salvando ? '⏳ Salvando...' : '💾 Salvar alterações'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Lightbox de foto ── */}
      {fotoAmpliada !== null && totalFotos > 0 && (
        <div
          className="lightbox-overlay"
          onClick={() => setFotoAmpliada(null)}
        >
          <div className="lightbox-box" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-fechar" onClick={() => setFotoAmpliada(null)}>✕</button>
            {totalFotos > 1 && (
              <button
                className="lightbox-nav lightbox-prev"
                onClick={() => setFotoAmpliada((fotoAmpliada - 1 + totalFotos) % totalFotos)}
              >‹</button>
            )}
            <img
              src={o.fotos[fotoAmpliada]}
              alt={`Foto ${fotoAmpliada + 1}`}
              className="lightbox-img"
            />
            {totalFotos > 1 && (
              <button
                className="lightbox-nav lightbox-next"
                onClick={() => setFotoAmpliada((fotoAmpliada + 1) % totalFotos)}
              >›</button>
            )}
            <div className="lightbox-contador">{fotoAmpliada + 1} / {totalFotos}</div>
          </div>
        </div>
      )}
    </>
  )
}

function InfoRow({ icone, label, valor }: { icone: string; label: string; valor: string }) {
  return (
    <div className="info-row">
      <span className="info-icone">{icone}</span>
      <div>
        <div className="info-label">{label}</div>
        <div className="info-valor">{valor}</div>
      </div>
    </div>
  )
}
