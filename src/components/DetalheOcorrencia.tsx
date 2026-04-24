import { useRef, useState } from 'react'
import JSZip from 'jszip'
import type { Ocorrencia, NivelRisco, StatusOc, VistoriaAdicional } from '../types'
import { NATUREZA_ICONE, NATUREZA_COR, TIPOS_OCORRENCIA, NATUREZAS, AGENTES } from '../types'
import { deletarOcorrencia, atualizarOcorrencia } from '../api'
import { geocodificarEndereco, updatePending } from '../offline'
import { exportarOcorrenciaExcel } from '../exportExcel'
import { formatarCoordenadas, parseDateLocal, mensagemErroGps, adicionarMarcaDagua } from '../utils'
import ModalSenha from './ModalSenha'

interface Props {
  ocorrencia: Ocorrencia
  onFechar: () => void
  onDeletado: () => void
  onAtualizado: (o: Ocorrencia) => void
}

type DmsEdicao = {
  graus: string
  minutos: string
  segundos: string
  direcao: string
}

function decimalParaPartesGms(valor: number | null, positivo: string, negativo: string): DmsEdicao {
  if (valor == null) return { graus: '', minutos: '', segundos: '', direcao: negativo }
  const absoluto = Math.abs(valor)
  let graus = Math.floor(absoluto)
  const minutosFloat = (absoluto - graus) * 60
  let minutos = Math.floor(minutosFloat)
  let segundosNum = Math.round((minutosFloat - minutos) * 6000) / 100
  if (segundosNum >= 60) {
    segundosNum = 0
    minutos += 1
  }
  if (minutos >= 60) {
    minutos = 0
    graus += 1
  }
  const segundos = segundosNum.toFixed(2).replace('.', ',')
  return {
    graus: String(graus),
    minutos: String(minutos),
    segundos,
    direcao: valor >= 0 ? positivo : negativo,
  }
}

function partesGmsParaDecimal(partes: DmsEdicao, negativo: string, limiteGraus: number, label: string): number | null {
  const temValor = partes.graus.trim() || partes.minutos.trim() || partes.segundos.trim()
  if (!temValor) return null

  const graus = Number(partes.graus.replace(',', '.'))
  const minutos = Number((partes.minutos || '0').replace(',', '.'))
  const segundos = Number((partes.segundos || '0').replace(',', '.'))

  if (!Number.isFinite(graus) || !Number.isFinite(minutos) || !Number.isFinite(segundos)) {
    throw new Error(`${label}: informe apenas números em graus, minutos e segundos.`)
  }
  if (!Number.isInteger(graus) || !Number.isInteger(minutos) || graus < 0 || graus > limiteGraus || minutos < 0 || minutos >= 60 || segundos < 0 || segundos >= 60) {
    throw new Error(`${label}: confira os valores de graus, minutos e segundos.`)
  }

  const sinal = partes.direcao === negativo ? -1 : 1
  return parseFloat((sinal * (graus + minutos / 60 + segundos / 3600)).toFixed(6))
}

export default function DetalheOcorrencia({ ocorrencia: oc, onFechar, onDeletado, onAtualizado }: Props) {
  const [o, setO] = useState<Ocorrencia>(oc)
  const [editando, setEditando] = useState(false)
  const [pedindoSenha, setPedindoSenha] = useState<'editar' | 'deletar' | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [geocodificando, setGeocodificando] = useState(false)
  const [geoMsg, setGeoMsg] = useState('')
  const [erroEdit, setErroEdit] = useState('')
  const [fotoAmpliada, setFotoAmpliada] = useState<number | null>(null)
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)

  // ── Nova Vistoria (Interdição de Imóvel) ──
  const [novaVistoriaAberta, setNovaVistoriaAberta] = useState(false)
  const [novaVistoriaObs, setNovaVistoriaObs] = useState('')
  const [novaVistoriaFotos, setNovaVistoriaFotos] = useState<string[]>([])
  const [novaVistoriaStatus, setNovaVistoriaStatus] = useState<StatusOc>('ativo')
  const [novaVistoriaData, setNovaVistoriaData] = useState<string>('')
  const [salvandoVistoria, setSalvandoVistoria] = useState(false)
  const [erroVistoria, setErroVistoria] = useState('')
  const [vistoriaFotoAmpliada, setVistoriaFotoAmpliada] = useState<{ vIdx: number; fIdx: number } | null>(null)
  const camVistoriaRef = useRef<HTMLInputElement>(null)
  const galVistoriaRef = useRef<HTMLInputElement>(null)

  const ehInterdicaoImovel = o.natureza === 'Interdição de Imóvel'
  const vistoriasSalvas: VistoriaAdicional[] = Array.isArray(o.vistorias) ? o.vistorias : []

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
  const [eLatDms, setELatDms] = useState<DmsEdicao>(decimalParaPartesGms(o.lat, 'N', 'S'))
  const [eLngDms, setELngDms] = useState<DmsEdicao>(decimalParaPartesGms(o.lng, 'L', 'O'))
  const [eProprietario, setEProprietario] = useState(o.proprietario ?? '')
  const [eSituacao, setESituacao] = useState(o.situacao ?? '')
  const [eRecomendacao, setERecomendacao] = useState(o.recomendacao ?? '')
  const [eConclusao, setEConclusao] = useState(o.conclusao ?? '')
  const [eAgentes, setEAgentes] = useState<string[]>(Array.isArray(o.agentes) ? o.agentes : [])

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
    setELatDms(decimalParaPartesGms(o.lat, 'N', 'S'))
    setELngDms(decimalParaPartesGms(o.lng, 'L', 'O'))
    setEProprietario(o.proprietario ?? '')
    setESituacao(o.situacao ?? '')
    setERecomendacao(o.recomendacao ?? '')
    setEConclusao(o.conclusao ?? '')
    setEAgentes(Array.isArray(o.agentes) ? o.agentes : [])
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
      setELatDms(decimalParaPartesGms(res.lat, 'N', 'S'))
      setELngDms(decimalParaPartesGms(res.lng, 'L', 'O'))
      setGeoMsg(`✅ ${formatarCoordenadas(res.lat, res.lng)}`)
    } else {
      setGeoMsg('⚠️ Endereço não encontrado')
    }
  }

  async function salvarEdicao() {
    const tipoFinal = eTipo === 'Outro' ? (eTipoOutro.trim() || 'Outro') : eTipo
    if (!tipoFinal) { setErroEdit('Selecione o tipo.'); return }
    if (!eNatureza) { setErroEdit('Selecione a natureza.'); return }

    let finalLat: number | null
    let finalLng: number | null
    try {
      finalLat = partesGmsParaDecimal(eLatDms, 'S', 90, 'Latitude')
      finalLng = partesGmsParaDecimal(eLngDms, 'O', 180, 'Longitude')
    } catch (err) {
      setErroEdit(err instanceof Error ? err.message : 'Confira as coordenadas.')
      return
    }
    if ((finalLat == null || finalLng == null) && (finalLat != null || finalLng != null)) {
      setErroEdit('Informe latitude e longitude completas, ou limpe as duas coordenadas.')
      return
    }
    if (finalLat == null && eEndereco.trim() && navigator.onLine) {
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
        situacao: eSituacao || null,
        recomendacao: eRecomendacao || null,
        conclusao: eConclusao || null,
        agentes: eAgentes,
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
        ${o.situacao ? `<b>Situação:</b> ${o.situacao}<br/>` : ''}
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

  function abrirNovaVistoria() {
    setNovaVistoriaObs('')
    setNovaVistoriaFotos([])
    setNovaVistoriaStatus('ativo')
    setNovaVistoriaData(new Date().toISOString())
    setErroVistoria('')
    setNovaVistoriaAberta(true)
  }

  function cancelarNovaVistoria() {
    setNovaVistoriaAberta(false)
    setNovaVistoriaObs('')
    setNovaVistoriaFotos([])
    setErroVistoria('')
  }

  function adicionarFotosVistoria(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        if (ev.target?.result) {
          const comMarca = await adicionarMarcaDagua(ev.target.result as string, o.lat, o.lng)
          setNovaVistoriaFotos((prev) => [...prev, comMarca])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  async function salvarNovaVistoria() {
    if (!novaVistoriaObs.trim() && novaVistoriaFotos.length === 0) {
      setErroVistoria('Informe ao menos uma observação ou foto da nova vistoria.')
      return
    }
    setErroVistoria('')
    setSalvandoVistoria(true)
    try {
      const nova: VistoriaAdicional = {
        data: novaVistoriaData || new Date().toISOString(),
        observacao: novaVistoriaObs.trim(),
        fotos: novaVistoriaFotos,
        agente: sessionStorage.getItem('defesacivil-agente-sessao') || null,
        status: novaVistoriaStatus,
      }
      const vistoriasAtualizadas = [...vistoriasSalvas, nova]
      const dadosUpdate = {
        tipo: o.tipo,
        natureza: o.natureza,
        subnatureza: o.subnatureza,
        nivel_risco: o.nivel_risco,
        status_oc: o.status_oc,
        fotos: o.fotos,
        lat: o.lat,
        lng: o.lng,
        endereco: o.endereco,
        proprietario: o.proprietario,
        situacao: o.situacao,
        recomendacao: o.recomendacao,
        conclusao: o.conclusao,
        data_ocorrencia: o.data_ocorrencia,
        agentes: o.agentes,
        vistorias: vistoriasAtualizadas,
      }
      let atualizado: Ocorrencia
      if (o._offline && o._localId != null) {
        await updatePending(o._localId, dadosUpdate)
        atualizado = { ...o, vistorias: vistoriasAtualizadas }
      } else {
        atualizado = await atualizarOcorrencia(o.id, dadosUpdate)
      }
      setO(atualizado)
      onAtualizado(atualizado)
      setNovaVistoriaAberta(false)
      setNovaVistoriaObs('')
      setNovaVistoriaFotos([])
    } catch (err) {
      console.error(err)
      setErroVistoria('Erro ao salvar nova vistoria. Tente novamente.')
    } finally {
      setSalvandoVistoria(false)
    }
  }

  async function salvarRelatorio() {
    setGerandoRelatorio(true)
    try {
      const res = await fetch('/api/relatorio-vistoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(o),
      })
      if (!res.ok) {
        let msg = 'Erro ao salvar relatório'
        try {
          const data = await res.json()
          msg = data?.error || msg
        } catch {
          msg = await res.text() || msg
        }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1]
      const normalName = disposition.match(/filename="?([^"]+)"?/)?.[1]
      const filename = utf8Name ? decodeURIComponent(utf8Name) : (normalName || `RelVist_${o.id}.docx`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar relatório')
    } finally {
      setGerandoRelatorio(false)
    }
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
                <button className="btn-editar-header" onClick={() => setPedindoSenha('editar')} title="Editar ocorrência">
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
                    valor={parseDateLocal(o.data_ocorrencia)?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) ?? '—'}
                  />
                )}

                {(o.lat && o.lng) && (
                  <InfoRow icone="🛰️" label="Coordenadas GPS" valor={formatarCoordenadas(o.lat, o.lng)} />
                )}
                {o.endereco && (
                  <InfoRow icone="📍" label="Endereço" valor={o.endereco} />
                )}
                {!o.lat && !o.lng && !o.endereco && (
                  <InfoRow icone="📍" label="Localização" valor="Não informada" />
                )}

                {o.proprietario && <InfoRow icone="👤" label="Proprietário / Morador" valor={o.proprietario} />}
                {o.situacao && <InfoRow icone="📝" label="Situação" valor={o.situacao} />}
                {o.recomendacao && <InfoRow icone="💡" label="Recomendação" valor={o.recomendacao} />}
                {o.conclusao && <InfoRow icone="✅" label="Conclusão" valor={o.conclusao} />}
                {o.responsavel_registro && (
                  <InfoRow icone="🪪" label="Responsável pelo Registro" valor={o.responsavel_registro!} destaque />
                )}
                {Array.isArray(o.agentes) && o.agentes.length > 0 && (
                  <InfoRow icone="👷" label="Agentes Empenhados" valor={o.agentes.join(', ')} />
                )}
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

                {/* ── Histórico de Novas Vistorias (Interdição de Imóvel) ── */}
                {ehInterdicaoImovel && vistoriasSalvas.length > 0 && (
                  <div className="vistorias-historico">
                    <div className="detalhe-label-row">
                      🔍 Vistorias adicionais ({vistoriasSalvas.length})
                    </div>
                    {vistoriasSalvas.map((v, idx) => (
                      <div key={idx} className="vistoria-card">
                        <div className="vistoria-cabecalho">
                          <strong>Vistoria #{idx + 1}</strong>
                          <span className="vistoria-data">
                            {new Date(v.data).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {v.status && (
                          <div className={`vistoria-status vistoria-status--${v.status}`}>
                            {v.status === 'resolvido' ? '✅ Resolvido' : '🟠 Ativo'}
                          </div>
                        )}
                        {v.agente && (
                          <div className="vistoria-agente">👤 {v.agente}</div>
                        )}
                        {v.observacao && (
                          <div className="vistoria-obs">{v.observacao}</div>
                        )}
                        {Array.isArray(v.fotos) && v.fotos.length > 0 && (
                          <div className="fotos-grid">
                            {v.fotos.map((f, fIdx) => (
                              <button
                                key={fIdx}
                                className="foto-btn"
                                onClick={() => setVistoriaFotoAmpliada({ vIdx: idx, fIdx })}
                                title="Ampliar foto"
                              >
                                <img src={f} alt={`Vistoria ${idx + 1} foto ${fIdx + 1}`} className="foto-detalhe" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Formulário inline para Nova Vistoria ── */}
                {ehInterdicaoImovel && novaVistoriaAberta && (
                  <div className="vistoria-nova-card">
                    <div className="detalhe-label-row">➕ Nova Vistoria</div>

                    <div className="campo">
                      <label className="campo-label">📅 Data e hora da vistoria</label>
                      <div className="vistoria-data-auto">
                        {novaVistoriaData
                          ? new Date(novaVistoriaData).toLocaleString('pt-BR')
                          : new Date().toLocaleString('pt-BR')}
                        <span className="vistoria-data-tag">automático</span>
                      </div>
                    </div>

                    <div className="campo">
                      <label className="campo-label">🚦 Status</label>
                      <div className="vistoria-status-opcoes">
                        <button
                          type="button"
                          className={`vistoria-status-btn ${novaVistoriaStatus === 'ativo' ? 'ativo-sel' : ''}`}
                          onClick={() => setNovaVistoriaStatus('ativo')}
                        >
                          🟠 Ativo
                        </button>
                        <button
                          type="button"
                          className={`vistoria-status-btn ${novaVistoriaStatus === 'resolvido' ? 'resolvido-sel' : ''}`}
                          onClick={() => setNovaVistoriaStatus('resolvido')}
                        >
                          ✅ Resolvido
                        </button>
                      </div>
                    </div>

                    <div className="campo">
                      <label className="campo-label">Fotos da nova vistoria</label>
                      <div className="fotos-area">
                        {novaVistoriaFotos.map((f, i) => (
                          <div key={i} className="foto-wrap">
                            <img src={f} alt="" className="foto-thumb" />
                            <button
                              className="foto-del"
                              onClick={() => setNovaVistoriaFotos((p) => p.filter((_, j) => j !== i))}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                      <div className="fotos-botoes">
                        <button className="btn-foto-camera" onClick={() => camVistoriaRef.current?.click()}>
                          <span>📷</span><span>Tirar Foto</span>
                        </button>
                        <button className="btn-foto-galeria" onClick={() => galVistoriaRef.current?.click()}>
                          <span>🖼️</span><span>Carregar Foto</span>
                        </button>
                      </div>
                      <input ref={camVistoriaRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={adicionarFotosVistoria} />
                      <input ref={galVistoriaRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={adicionarFotosVistoria} />
                    </div>
                    <div className="campo">
                      <label className="campo-label">📝 Observação</label>
                      <textarea
                        className="campo-textarea"
                        rows={4}
                        placeholder="Descreva o que foi observado nesta nova vistoria..."
                        value={novaVistoriaObs}
                        onChange={(e) => setNovaVistoriaObs(e.target.value)}
                      />
                    </div>
                    {erroVistoria && <div className="erro-msg">⚠️ {erroVistoria}</div>}
                    <div className="vistoria-nova-acoes">
                      <button className="btn-cancelar-edit" onClick={cancelarNovaVistoria} disabled={salvandoVistoria}>
                        Cancelar
                      </button>
                      <button className="btn-salvar-edit" onClick={salvarNovaVistoria} disabled={salvandoVistoria}>
                        {salvandoVistoria ? '⏳ Salvando...' : '💾 Salvar Nova Vistoria'}
                      </button>
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
                  <div className="gps-dms-edit">
                    <div className="gps-dms-linha">
                      <span className="gps-dms-label">Lat.</span>
                      <input className="campo-input gps-dms-num" type="text" inputMode="numeric" placeholder="Graus" value={eLatDms.graus} onChange={(e) => setELatDms((p) => ({ ...p, graus: e.target.value }))} />
                      <span className="gps-dms-unidade">°</span>
                      <input className="campo-input gps-dms-num" type="text" inputMode="numeric" placeholder="Min" value={eLatDms.minutos} onChange={(e) => setELatDms((p) => ({ ...p, minutos: e.target.value }))} />
                      <span className="gps-dms-unidade">'</span>
                      <input className="campo-input gps-dms-sec" type="text" inputMode="decimal" placeholder="Seg" value={eLatDms.segundos} onChange={(e) => setELatDms((p) => ({ ...p, segundos: e.target.value }))} />
                      <span className="gps-dms-unidade">"</span>
                      <select className="campo-select gps-dms-dir" value={eLatDms.direcao} onChange={(e) => setELatDms((p) => ({ ...p, direcao: e.target.value }))}>
                        <option>S</option>
                        <option>N</option>
                      </select>
                    </div>
                    <div className="gps-dms-linha">
                      <span className="gps-dms-label">Long.</span>
                      <input className="campo-input gps-dms-num" type="text" inputMode="numeric" placeholder="Graus" value={eLngDms.graus} onChange={(e) => setELngDms((p) => ({ ...p, graus: e.target.value }))} />
                      <span className="gps-dms-unidade">°</span>
                      <input className="campo-input gps-dms-num" type="text" inputMode="numeric" placeholder="Min" value={eLngDms.minutos} onChange={(e) => setELngDms((p) => ({ ...p, minutos: e.target.value }))} />
                      <span className="gps-dms-unidade">'</span>
                      <input className="campo-input gps-dms-sec" type="text" inputMode="decimal" placeholder="Seg" value={eLngDms.segundos} onChange={(e) => setELngDms((p) => ({ ...p, segundos: e.target.value }))} />
                      <span className="gps-dms-unidade">"</span>
                      <select className="campo-select gps-dms-dir" value={eLngDms.direcao} onChange={(e) => setELngDms((p) => ({ ...p, direcao: e.target.value }))}>
                        <option>O</option>
                        <option>L</option>
                      </select>
                    </div>
                  </div>
                  <div className="gps-edit-row gps-edit-row-acoes">
                    <button
                      className="btn-gps"
                      title="Obter GPS atual"
                      onClick={() => {
                        if (!navigator.geolocation) {
                          setGeoMsg('⚠️ GPS não suportado neste dispositivo.')
                          return
                        }
                        // IMPORTANTE: no iOS o getCurrentPosition deve ser chamado de forma
                        // síncrona dentro do handler do gesto do usuário.
                        navigator.geolocation.getCurrentPosition((p) => {
                          setELatDms(decimalParaPartesGms(parseFloat(p.coords.latitude.toFixed(6)), 'N', 'S'))
                          setELngDms(decimalParaPartesGms(parseFloat(p.coords.longitude.toFixed(6)), 'L', 'O'))
                          setGeoMsg('✅ GPS atualizado!')
                        }, (err) => setGeoMsg(`⚠️ ${mensagemErroGps(err)}`), { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 })
                      }}
                    >
                      📍 Usar GPS atual
                    </button>
                    <button
                      className="btn-gps btn-gps-limpar"
                      title="Limpar coordenadas"
                      onClick={() => {
                        setELatDms(decimalParaPartesGms(null, 'N', 'S'))
                        setELngDms(decimalParaPartesGms(null, 'L', 'O'))
                      }}
                    >
                      ✕ Limpar
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

                {/* Situação */}
                <div className="campo campo-edit">
                  <label className="campo-label">📝 9 — Situação</label>
                  <textarea
                    className="campo-textarea"
                    rows={3}
                    placeholder="Descreva a situação da ocorrência..."
                    value={eSituacao}
                    onChange={(e) => setESituacao(e.target.value)}
                  />
                </div>

                {/* Recomendação */}
                <div className="campo campo-edit">
                  <label className="campo-label">💡 10 — Recomendação</label>
                  <textarea
                    className="campo-textarea"
                    rows={3}
                    placeholder="Descreva a recomendação..."
                    value={eRecomendacao}
                    onChange={(e) => setERecomendacao(e.target.value)}
                  />
                </div>

                {/* Conclusão */}
                <div className="campo campo-edit">
                  <label className="campo-label">✅ 11 — Conclusão</label>
                  <textarea
                    className="campo-textarea"
                    rows={3}
                    placeholder="Descreva a conclusão..."
                    value={eConclusao}
                    onChange={(e) => setEConclusao(e.target.value)}
                  />
                </div>

                {/* Agentes Empenhados */}
                <div className="campo campo-edit">
                  <label className="campo-label">👷 12 — Agentes Empenhados na Ocorrência</label>
                  <div className="agentes-lista">
                    {AGENTES.map((nome) => (
                      <label key={nome} className="agente-item">
                        <input
                          type="checkbox"
                          className="agente-checkbox"
                          checked={eAgentes.includes(nome)}
                          onChange={(e) => {
                            if (e.target.checked) setEAgentes((p) => [...p, nome])
                            else setEAgentes((p) => p.filter((a) => a !== nome))
                          }}
                        />
                        <span className="agente-nome">{nome}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {erroEdit && <div className="erro-msg">⚠️ {erroEdit}</div>}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="modal-footer">
            {!editando ? (
              <>
                {ehInterdicaoImovel && !novaVistoriaAberta && (
                  <button className="btn-nova-vistoria" onClick={abrirNovaVistoria}>
                    ➕ Nova Vistoria
                  </button>
                )}
                <button className="btn-editar" onClick={() => setPedindoSenha('editar')}>✏️ Editar</button>
                <button className="btn-relatorio" onClick={salvarRelatorio} disabled={gerandoRelatorio}>
                  {gerandoRelatorio ? '⏳ Salvando...' : '📄 Salvar relatório'}
                </button>
                <button className="btn-excel" onClick={() => exportarOcorrenciaExcel(o)}>📊 Excel</button>
                <button className="btn-kmz" onClick={exportarKMZ}>🌍 KMZ</button>
                <button className="btn-deletar" onClick={() => setPedindoSenha('deletar')}>🗑️</button>
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

      {/* ── Lightbox das fotos de vistorias adicionais ── */}
      {vistoriaFotoAmpliada !== null && vistoriasSalvas[vistoriaFotoAmpliada.vIdx]?.fotos?.length > 0 && (() => {
        const v = vistoriasSalvas[vistoriaFotoAmpliada.vIdx]
        const total = v.fotos.length
        const cur = vistoriaFotoAmpliada.fIdx
        return (
          <div className="lightbox-overlay" onClick={() => setVistoriaFotoAmpliada(null)}>
            <div className="lightbox-box" onClick={(e) => e.stopPropagation()}>
              <button className="lightbox-fechar" onClick={() => setVistoriaFotoAmpliada(null)}>✕</button>
              {total > 1 && (
                <button
                  className="lightbox-nav lightbox-prev"
                  onClick={() => setVistoriaFotoAmpliada({ vIdx: vistoriaFotoAmpliada.vIdx, fIdx: (cur - 1 + total) % total })}
                >‹</button>
              )}
              <img src={v.fotos[cur]} alt={`Vistoria ${vistoriaFotoAmpliada.vIdx + 1}`} className="lightbox-img" />
              {total > 1 && (
                <button
                  className="lightbox-nav lightbox-next"
                  onClick={() => setVistoriaFotoAmpliada({ vIdx: vistoriaFotoAmpliada.vIdx, fIdx: (cur + 1) % total })}
                >›</button>
              )}
              <div className="lightbox-contador">Vistoria #{vistoriaFotoAmpliada.vIdx + 1} — {cur + 1} / {total}</div>
            </div>
          </div>
        )
      })()}

      {pedindoSenha && (
        <ModalSenha
          titulo={pedindoSenha === 'editar' ? 'Editar Ocorrência' : 'Excluir Ocorrência'}
          onCancelar={() => setPedindoSenha(null)}
          onConfirmar={() => {
            setPedindoSenha(null)
            if (pedindoSenha === 'editar') iniciarEdicao()
            else confirmarDelete()
          }}
        />
      )}
    </>
  )
}

function InfoRow({ icone, label, valor, destaque }: { icone: string; label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`info-row${destaque ? ' info-row-destaque' : ''}`}>
      <span className="info-icone">{icone}</span>
      <div>
        <div className="info-label">{label}</div>
        <div className={`info-valor${destaque ? ' info-valor-destaque' : ''}`}>{valor}</div>
      </div>
    </div>
  )
}
