import { useState, useEffect, useRef } from 'react'
import { adicionarMarcaDagua } from '../utils'
import { exportarChecklistExcel, type ChecklistExportData } from '../exportExcel'

const MOTORISTAS = ['Moisés', 'Arthur', 'Gustavo', 'Valteir', 'Dyonathan']

type Opc3 = 'bom' | 'medio' | 'ruim' | ''
type OpcSN = 'sim' | 'nao' | 'na' | ''

interface Itens {
  limpezaExterna: Opc3; limpezaInterna: Opc3; pneus: Opc3; estepe: Opc3
  ltzPlaca: OpcSN; ltzDirLuz: OpcSN; ltzDirLuzRe: OpcSN; ltzDirFreio: OpcSN; ltzDirSeta: OpcSN
  ltzEsqLuz: OpcSN; ltzEsqLuzRe: OpcSN; ltzEsqFreio: OpcSN; ltzEsqSeta: OpcSN
  ldzPlaca: OpcSN; ldzDirFarolAlto: OpcSN; ldzDirFarolBaixo: OpcSN; ldzDirNeblina: OpcSN
  ldzEsqFarolAlto: OpcSN; ldzEsqFarolBaixo: OpcSN; ldzEsqSeta: OpcSN; ldzEsqNeblina: OpcSN
  segAlarme: OpcSN; segBuzina: OpcSN; segChaveRoda: OpcSN; segCintos: OpcSN
  segDocumentos: OpcSN; segExtintor: OpcSN; segLimpadores: OpcSN; segMacaco: OpcSN
  segPainel: OpcSN; segRetrovisorInterno: OpcSN; segRetrovisorDireito: OpcSN
  segRetrovisorEsquerdo: OpcSN; segTravas: OpcSN; segTriangulo: OpcSN
  motAcelerador: OpcSN; motAguaLimpador: OpcSN; motAguaRadiador: OpcSN
  motEmbreagem: OpcSN; motFreio: OpcSN; motFreioMao: OpcSN
  motOleoFreio: OpcSN; motOleoMoto: OpcSN; motTanquePartida: OpcSN
}

function itensIniciais(): Itens {
  return {
    limpezaExterna: '', limpezaInterna: '', pneus: '', estepe: '',
    ltzPlaca: '', ltzDirLuz: '', ltzDirLuzRe: '', ltzDirFreio: '', ltzDirSeta: '',
    ltzEsqLuz: '', ltzEsqLuzRe: '', ltzEsqFreio: '', ltzEsqSeta: '',
    ldzPlaca: '', ldzDirFarolAlto: '', ldzDirFarolBaixo: '', ldzDirNeblina: '',
    ldzEsqFarolAlto: '', ldzEsqFarolBaixo: '', ldzEsqSeta: '', ldzEsqNeblina: '',
    segAlarme: '', segBuzina: '', segChaveRoda: '', segCintos: '', segDocumentos: '',
    segExtintor: '', segLimpadores: '', segMacaco: '', segPainel: '',
    segRetrovisorInterno: '', segRetrovisorDireito: '', segRetrovisorEsquerdo: '',
    segTravas: '', segTriangulo: '',
    motAcelerador: '', motAguaLimpador: '', motAguaRadiador: '', motEmbreagem: '',
    motFreio: '', motFreioMao: '', motOleoFreio: '', motOleoMoto: '', motTanquePartida: '',
  }
}

type ChecklistData = ChecklistExportData

type Modo = 'lista' | 'form' | 'detalhe'

const OPT_BMR = ['bom', 'medio', 'ruim']
const OPT_SN = ['sim', 'nao', 'na']

function CarFront() {
  return (
    <svg viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="45">
      <rect x="6" y="28" width="108" height="40" rx="7" fill="#cbd5e1"/>
      <path d="M28 28 L38 8 L82 8 L92 28 Z" fill="#b8c4ce"/>
      <path d="M32 28 L41 11 L79 11 L88 28 Z" fill="#bfdbfe" opacity="0.9"/>
      <rect x="7" y="32" width="24" height="13" rx="5" fill="#fde68a"/>
      <rect x="89" y="32" width="24" height="13" rx="5" fill="#fde68a"/>
      <rect x="40" y="55" width="40" height="9" rx="3" fill="#94a3b8"/>
      <rect x="6" y="50" width="14" height="16" rx="4" fill="#b8c4ce"/>
      <rect x="100" y="50" width="14" height="16" rx="4" fill="#b8c4ce"/>
    </svg>
  )
}

function CarRear() {
  return (
    <svg viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg" width="72" height="45">
      <rect x="6" y="28" width="108" height="40" rx="7" fill="#cbd5e1"/>
      <path d="M28 28 L38 8 L82 8 L92 28 Z" fill="#b8c4ce"/>
      <path d="M34 28 L43 12 L77 12 L86 28 Z" fill="#bfdbfe" opacity="0.9"/>
      <rect x="7" y="32" width="24" height="13" rx="5" fill="#fca5a5"/>
      <rect x="89" y="32" width="24" height="13" rx="5" fill="#fca5a5"/>
      <rect x="40" y="57" width="40" height="7" rx="2" fill="#94a3b8"/>
      <rect x="6" y="50" width="14" height="16" rx="4" fill="#b8c4ce"/>
      <rect x="100" y="50" width="14" height="16" rx="4" fill="#b8c4ce"/>
    </svg>
  )
}

function CarSide({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 160 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="90" height="45"
      style={flip ? { transform: 'scaleX(-1)' } : {}}>
      <path d="M12 54 L12 36 L48 14 L112 14 L142 36 L148 54 Z" fill="#cbd5e1"/>
      <path d="M50 36 L58 17 L110 17 L120 36 Z" fill="#bfdbfe" opacity="0.9"/>
      <line x1="78" y1="17" x2="78" y2="36" stroke="#94a3b8" strokeWidth="2.5"/>
      <circle cx="36" cy="60" r="14" fill="#64748b"/>
      <circle cx="36" cy="60" r="7" fill="#94a3b8"/>
      <circle cx="122" cy="60" r="14" fill="#64748b"/>
      <circle cx="122" cy="60" r="7" fill="#94a3b8"/>
      <rect x="3" y="44" width="11" height="16" rx="4" fill="#b8c4ce"/>
      <rect x="146" y="44" width="11" height="16" rx="4" fill="#b8c4ce"/>
    </svg>
  )
}

function redimensionarImagem(dataUrl: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width; let h = img.height
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h)
        w = Math.round(w * ratio); h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.src = dataUrl
  })
}

interface FotoSlotHProps {
  label: string
  foto: string | null
  onFoto: (b64: string) => void
  children: React.ReactNode
}

function FotoSlotH({ label, foto, onFoto, children }: FotoSlotHProps) {
  const ref = useRef<HTMLInputElement>(null)
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      if (ev.target?.result) {
        const redim = await redimensionarImagem(ev.target.result as string, 1200, 900)
        const comMarca = await adicionarMarcaDagua(redim)
        onFoto(comMarca)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  return (
    <div className="ck-foto-slot" onClick={() => ref.current?.click()}>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleChange} />
      {foto ? (
        <>
          <img src={foto} alt={label} className="ck-foto-img" />
          <span className="ck-foto-nome">{label}</span>
        </>
      ) : (
        <div className="ck-foto-empty">
          <div className="ck-foto-icon">{children}</div>
          <span className="ck-foto-label">{label}</span>
          <span className="ck-foto-hint">📷</span>
        </div>
      )}
    </div>
  )
}

function RadioDot({ value, atual, onChange }: { value: string; atual: string; onChange: (v: string) => void }) {
  const ativo = atual === value
  return (
    <div
      className={`ck-dot${ativo ? ` ck-dot-${value}` : ''}`}
      onClick={(e) => { e.stopPropagation(); onChange(ativo ? '' : value) }}
    />
  )
}

function CkRow({ label, campo, itens, onChange, opcoes }: {
  label: string; campo: keyof Itens; itens: Itens
  onChange: (k: keyof Itens, v: string) => void; opcoes: string[]
}) {
  return (
    <div className="ck-row">
      <span className="ck-row-label">{label}</span>
      {opcoes.map(o => (
        <div key={o} className="ck-row-cell">
          <RadioDot value={o} atual={itens[campo] as string} onChange={(v) => onChange(campo, v)} />
        </div>
      ))}
    </div>
  )
}

function CkSecRow({ label }: { label: string }) {
  return <div className="ck-sec-row">{label}</div>
}

function CkHeader({ cols }: { cols: string[] }) {
  return (
    <div className="ck-header-row">
      <span className="ck-row-label" />
      {cols.map(c => <span key={c} className="ck-header-cell">{c}</span>)}
    </div>
  )
}

function formatarData(iso: string) {
  const [y, m, d] = iso.split('-')
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const dt = new Date(`${iso}T12:00:00`)
  return `${dias[dt.getDay()]}, ${d}/${m}/${y}`
}

export default function ChecklistViatura() {
  const [modo, setModo] = useState<Modo>('lista')
  const [checklists, setChecklists] = useState<ChecklistData[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<ChecklistData | null>(null)

  const hoje = new Date().toISOString().split('T')[0]
  const [data, setData] = useState(hoje)
  const [km, setKm] = useState('')
  const [placa, setPlaca] = useState('')
  const [motorista, setMotorista] = useState('')
  const [fotosAvarias, setFotosAvarias] = useState<string[]>([])
  const [fotoFrontal, setFotoFrontal] = useState<string | null>(null)
  const [fotoTraseira, setFotoTraseira] = useState<string | null>(null)
  const [fotoDireita, setFotoDireita] = useState<string | null>(null)
  const [fotoEsquerda, setFotoEsquerda] = useState<string | null>(null)
  const [itens, setItens] = useState<Itens>(itensIniciais())
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const avariaRef = useRef<HTMLInputElement>(null)

  function setItem(k: keyof Itens, v: string) {
    setItens(prev => ({ ...prev, [k]: v }))
  }

  async function carregar() {
    setCarregando(true)
    try {
      const res = await fetch('/api/checklists')
      const data = await res.json()
      setChecklists(data)
    } catch { setChecklists([]) }
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  function resetForm() {
    setData(hoje); setKm(''); setPlaca(''); setMotorista('')
    setFotosAvarias([]); setFotoFrontal(null); setFotoTraseira(null)
    setFotoDireita(null); setFotoEsquerda(null)
    setItens(itensIniciais()); setObservacoes(''); setErro('')
  }

  function adicionarAvaria(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        if (ev.target?.result) {
          const redim = await redimensionarImagem(ev.target.result as string, 1200, 900)
          const comMarca = await adicionarMarcaDagua(redim)
          setFotosAvarias(p => [...p, comMarca])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  async function salvar() {
    if (!motorista) { setErro('Selecione o motorista.'); return }
    setSalvando(true); setErro('')
    try {
      await fetch('/api/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_checklist: data, km, placa, motorista,
          fotos_avarias: fotosAvarias,
          foto_frontal: fotoFrontal, foto_traseira: fotoTraseira,
          foto_direita: fotoDireita, foto_esquerda: fotoEsquerda,
          itens, observacoes: observacoes || null,
        }),
      })
      await carregar(); resetForm(); setModo('lista')
    } catch { setErro('Erro ao salvar. Tente novamente.') }
    setSalvando(false)
  }

  async function deletar(id: number) {
    if (!confirm('Excluir este checklist?')) return
    await fetch(`/api/checklists/${id}`, { method: 'DELETE' })
    setSelecionado(null); setModo('lista'); await carregar()
  }

  if (modo === 'form') {
    return (
      <div className="tela">
        <header className="header">
          <button className="btn-voltar" onClick={() => { resetForm(); setModo('lista') }}>‹</button>
          <div className="header-logo-mini">
            <span style={{ fontSize: '1.3rem' }}>🚗</span>
            <span className="header-titulo-texto">Checklist da Viatura</span>
          </div>
          <div style={{ width: 36 }} />
        </header>

        <div className="form-scroll">
          <div className="form-card" style={{ padding: '0.75rem', gap: 0 }}>

            {/* ── Cabeçalho: Motorista / Data / Placa ── */}
            <div className="ck-header-fields">
              <div className="ck-hf-row">
                <div className="ck-hf-field" style={{ flex: 2 }}>
                  <label className="ck-hf-label">Motorista</label>
                  <select
                    className="ck-hf-input"
                    value={motorista}
                    onChange={e => setMotorista(e.target.value)}
                  >
                    <option value="">— Selecionar —</option>
                    {MOTORISTAS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="ck-hf-field" style={{ flex: 1 }}>
                  <label className="ck-hf-label">Data</label>
                  <input className="ck-hf-input" type="date" value={data} max={hoje}
                    onChange={e => setData(e.target.value)} />
                </div>
              </div>
              <div className="ck-hf-row">
                <div className="ck-hf-field" style={{ flex: 1 }}>
                  <label className="ck-hf-label">Placa</label>
                  <input className="ck-hf-input" type="text" placeholder="Ex: ABC-1234"
                    value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} />
                </div>
                <div className="ck-hf-field" style={{ flex: 1 }}>
                  <label className="ck-hf-label">KM</label>
                  <input className="ck-hf-input" type="text" inputMode="numeric" placeholder="Ex: 52.340"
                    value={km} onChange={e => setKm(e.target.value)} />
                </div>
              </div>
            </div>

            {/* ── Fotos do Veículo ── */}
            <div className="ck-section-title">FOTOS DO VEÍCULO</div>
            <div className="ck-fotos-4col">
              <FotoSlotH label="Esquerda" foto={fotoEsquerda} onFoto={setFotoEsquerda}><CarSide /></FotoSlotH>
              <FotoSlotH label="Frontal" foto={fotoFrontal} onFoto={setFotoFrontal}><CarFront /></FotoSlotH>
              <FotoSlotH label="Traseira" foto={fotoTraseira} onFoto={setFotoTraseira}><CarRear /></FotoSlotH>
              <FotoSlotH label="Direita" foto={fotoDireita} onFoto={setFotoDireita}><CarSide flip /></FotoSlotH>
            </div>

            {/* ── Fotos de Avaria ── */}
            <div className="ck-section-title">FOTOS DE AVARIA</div>
            <div
              className="ck-avaria-slot"
              onClick={() => fotosAvarias.length === 0 && avariaRef.current?.click()}
            >
              {fotosAvarias.length === 0 ? (
                <div className="ck-foto-empty">
                  <span style={{ fontSize: '1.8rem' }}>🔧</span>
                  <span className="ck-foto-label">Adicionar foto de avaria</span>
                  <span className="ck-foto-hint">📷 Toque para fotografar</span>
                </div>
              ) : (
                <div className="ck-avaria-grid">
                  {fotosAvarias.map((f, i) => (
                    <div key={i} className="foto-wrap">
                      <img src={f} alt="" className="foto-thumb" />
                      <button className="foto-del" onClick={e => { e.stopPropagation(); setFotosAvarias(p => p.filter((_, j) => j !== i)) }}>✕</button>
                    </div>
                  ))}
                  <button className="btn-add-foto-mini" onClick={e => { e.stopPropagation(); avariaRef.current?.click() }}>
                    + foto
                  </button>
                </div>
              )}
              <input ref={avariaRef} type="file" accept="image/*" multiple capture="environment"
                style={{ display: 'none' }} onChange={adicionarAvaria} />
            </div>

            {/* ── Conservação ── */}
            <div className="ck-table-wrap" style={{ marginTop: '0.75rem' }}>
              <CkHeader cols={['Bom', 'Médio', 'Ruim']} />
              <CkRow label="Limpeza Externa" campo="limpezaExterna" itens={itens} onChange={setItem} opcoes={OPT_BMR} />
              <CkRow label="Limpeza Interna" campo="limpezaInterna" itens={itens} onChange={setItem} opcoes={OPT_BMR} />
              <CkRow label="Pneus" campo="pneus" itens={itens} onChange={setItem} opcoes={OPT_BMR} />
              <CkRow label="Estepe" campo="estepe" itens={itens} onChange={setItem} opcoes={OPT_BMR} />
            </div>

            {/* ── Luzes Traseiras | Dianteiras ── */}
            <div className="ck-2col" style={{ marginTop: '0.75rem' }}>
              <div className="ck-table-wrap ck-with-side">
                <div className="ck-side-label">Luzes Traseiras</div>
                <div style={{ flex: 1 }}>
                  <CkHeader cols={['Sim', 'Não', 'N/A']} />
                  <CkRow label="Da placa" campo="ltzPlaca" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkSecRow label="Direita" />
                  <CkRow label="Luz" campo="ltzDirLuz" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Luz de ré" campo="ltzDirLuzRe" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Luz de freio" campo="ltzDirFreio" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Seta" campo="ltzDirSeta" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkSecRow label="Esquerda" />
                  <CkRow label="Luz" campo="ltzEsqLuz" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Luz de ré" campo="ltzEsqLuzRe" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Luz de freio" campo="ltzEsqFreio" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Seta" campo="ltzEsqSeta" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                </div>
              </div>

              <div className="ck-table-wrap ck-with-side">
                <div className="ck-side-label">Luzes Dianteiras</div>
                <div style={{ flex: 1 }}>
                  <CkHeader cols={['Sim', 'Não', 'N/A']} />
                  <CkRow label="Da placa" campo="ldzPlaca" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkSecRow label="Direita" />
                  <CkRow label="Farol alto" campo="ldzDirFarolAlto" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Farol baixo" campo="ldzDirFarolBaixo" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Neblina" campo="ldzDirNeblina" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkSecRow label="Esquerda" />
                  <CkRow label="Farol alto" campo="ldzEsqFarolAlto" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Farol baixo" campo="ldzEsqFarolBaixo" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Seta" campo="ldzEsqSeta" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Neblina" campo="ldzEsqNeblina" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                </div>
              </div>
            </div>

            {/* ── Segurança | Motor ── */}
            <div className="ck-2col" style={{ marginTop: '0.75rem' }}>
              <div className="ck-table-wrap ck-with-side">
                <div className="ck-side-label">Segurança</div>
                <div style={{ flex: 1 }}>
                  <CkHeader cols={['Sim', 'Não', 'N/A']} />
                  <CkRow label="Alarme" campo="segAlarme" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Buzina" campo="segBuzina" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Chave de Roda" campo="segChaveRoda" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Cintos" campo="segCintos" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Documentos" campo="segDocumentos" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Extintor" campo="segExtintor" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Limpadores" campo="segLimpadores" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Macaco" campo="segMacaco" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Painel" campo="segPainel" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Retrovisor Int." campo="segRetrovisorInterno" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Retrovisor Dir." campo="segRetrovisorDireito" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Retrovisor Esq." campo="segRetrovisorEsquerdo" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Travas" campo="segTravas" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Triângulo" campo="segTriangulo" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                </div>
              </div>

              <div className="ck-table-wrap ck-with-side">
                <div className="ck-side-label">Motor</div>
                <div style={{ flex: 1 }}>
                  <CkHeader cols={['Sim', 'Não', 'N/A']} />
                  <CkRow label="Acelerador" campo="motAcelerador" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Água limpador" campo="motAguaLimpador" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Água radiador" campo="motAguaRadiador" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Embreagem" campo="motEmbreagem" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Freio" campo="motFreio" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Freio de mão" campo="motFreioMao" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Óleo do freio" campo="motOleoFreio" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Óleo do motor" campo="motOleoMoto" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                  <CkRow label="Tanque/Partida" campo="motTanquePartida" itens={itens} onChange={setItem} opcoes={OPT_SN} />
                </div>
              </div>
            </div>

            {/* ── Observações ── */}
            <div className="campo" style={{ marginTop: '0.75rem' }}>
              <label className="campo-label">📝 Observações</label>
              <textarea className="campo-textarea" rows={3}
                placeholder="Observações adicionais sobre a viatura..."
                value={observacoes} onChange={e => setObservacoes(e.target.value)} />
            </div>

            {erro && <div className="erro-msg">⚠️ {erro}</div>}
          </div>
        </div>

        <div className="footer-fixo">
          <button className="btn-salvar" onClick={salvar} disabled={salvando}>
            {salvando ? '⏳ Salvando...' : '💾 Salvar Checklist'}
          </button>
        </div>
      </div>
    )
  }

  if (modo === 'detalhe' && selecionado) {
    const c = selecionado
    const it = (c.itens as unknown as Itens | null) || itensIniciais()
    const fotos4 = [
      { label: 'Esquerda', foto: c.foto_esquerda, icone: <CarSide /> },
      { label: 'Frontal', foto: c.foto_frontal, icone: <CarFront /> },
      { label: 'Traseira', foto: c.foto_traseira, icone: <CarRear /> },
      { label: 'Direita', foto: c.foto_direita, icone: <CarSide flip /> },
    ]

    function CkRowRO({ label, valor, opcoes }: { label: string; valor: string; opcoes: string[] }) {
      const labelMap: Record<string, string> = { bom: 'Bom', medio: 'Médio', ruim: 'Ruim', sim: 'Sim', nao: 'Não', na: 'N/A' }
      const colorMap: Record<string, string> = { bom: '#15803d', medio: '#d97706', ruim: '#dc2626', sim: '#15803d', nao: '#dc2626', na: '#6b7280' }
      return (
        <div className="ck-row">
          <span className="ck-row-label">{label}</span>
          {opcoes.map(o => (
            <div key={o} className="ck-row-cell">
              <div className={`ck-dot${valor === o ? ` ck-dot-${o}` : ''}`} style={{ cursor: 'default' }} />
            </div>
          ))}
          {valor && (
            <span style={{ fontSize: '0.7rem', color: colorMap[valor], fontWeight: 700, marginLeft: 4 }}>
              {labelMap[valor] || valor}
            </span>
          )}
        </div>
      )
    }

    return (
      <div className="tela">
        <header className="header">
          <button className="btn-voltar" onClick={() => { setSelecionado(null); setModo('lista') }}>‹</button>
          <div className="header-logo-mini">
            <span style={{ fontSize: '1.3rem' }}>🚗</span>
            <span className="header-titulo-texto">Checklist #{c.id}</span>
          </div>
          <button className="btn-deletar-header" onClick={() => deletar(c.id)}>🗑️</button>
        </header>

        <div className="form-scroll">
          <div className="form-card" style={{ padding: '0.75rem', gap: 0 }}>
            <div className="ck-detalhe-info">
              <span className="ck-det-data">{formatarData(c.data_checklist)}</span>
              {c.motorista && <span className="ck-det-badge">👤 {c.motorista}</span>}
              {c.placa && <span className="ck-det-badge">🚘 {c.placa}</span>}
              {c.km && <span className="ck-det-badge">🔢 {c.km} km</span>}
            </div>

            <div className="ck-section-title" style={{ marginTop: '0.5rem' }}>FOTOS DO VEÍCULO</div>
            <div className="ck-fotos-4col">
              {fotos4.map(({ label, foto, icone }) => (
                <div key={label} className="ck-foto-slot" style={{ cursor: 'default' }}>
                  {foto
                    ? <><img src={foto} alt={label} className="ck-foto-img" /><span className="ck-foto-nome">{label}</span></>
                    : <div className="ck-foto-empty">{icone}<span className="ck-foto-label">{label}</span></div>}
                </div>
              ))}
            </div>

            {c.fotos_avarias?.length > 0 && (
              <>
                <div className="ck-section-title">FOTOS DE AVARIA ({c.fotos_avarias.length})</div>
                <div className="ck-avaria-slot" style={{ cursor: 'default' }}>
                  <div className="ck-avaria-grid">
                    {c.fotos_avarias.map((f, i) => <img key={i} src={f} alt="" className="foto-thumb" />)}
                  </div>
                </div>
              </>
            )}

            <div className="ck-table-wrap" style={{ marginTop: '0.75rem' }}>
              <CkHeader cols={['Bom', 'Médio', 'Ruim']} />
              <CkRowRO label="Limpeza Externa" valor={it.limpezaExterna} opcoes={OPT_BMR} />
              <CkRowRO label="Limpeza Interna" valor={it.limpezaInterna} opcoes={OPT_BMR} />
              <CkRowRO label="Pneus" valor={it.pneus} opcoes={OPT_BMR} />
              <CkRowRO label="Estepe" valor={it.estepe} opcoes={OPT_BMR} />
            </div>

            <div className="ck-2col" style={{ marginTop: '0.75rem' }}>
              <div className="ck-table-wrap ck-with-side">
                <div className="ck-side-label">Luzes Traseiras</div>
                <div style={{ flex: 1 }}>
                  <CkHeader cols={['S', 'N', 'N/A']} />
                  <CkRowRO label="Da placa" valor={it.ltzPlaca} opcoes={OPT_SN} />
                  <CkSecRow label="Direita" />
                  <CkRowRO label="Luz" valor={it.ltzDirLuz} opcoes={OPT_SN} />
                  <CkRowRO label="Luz de ré" valor={it.ltzDirLuzRe} opcoes={OPT_SN} />
                  <CkRowRO label="Luz de freio" valor={it.ltzDirFreio} opcoes={OPT_SN} />
                  <CkRowRO label="Seta" valor={it.ltzDirSeta} opcoes={OPT_SN} />
                  <CkSecRow label="Esquerda" />
                  <CkRowRO label="Luz" valor={it.ltzEsqLuz} opcoes={OPT_SN} />
                  <CkRowRO label="Luz de ré" valor={it.ltzEsqLuzRe} opcoes={OPT_SN} />
                  <CkRowRO label="Luz de freio" valor={it.ltzEsqFreio} opcoes={OPT_SN} />
                  <CkRowRO label="Seta" valor={it.ltzEsqSeta} opcoes={OPT_SN} />
                </div>
              </div>
              <div className="ck-table-wrap ck-with-side">
                <div className="ck-side-label">Luzes Dianteiras</div>
                <div style={{ flex: 1 }}>
                  <CkHeader cols={['S', 'N', 'N/A']} />
                  <CkRowRO label="Da placa" valor={it.ldzPlaca} opcoes={OPT_SN} />
                  <CkSecRow label="Direita" />
                  <CkRowRO label="Farol alto" valor={it.ldzDirFarolAlto} opcoes={OPT_SN} />
                  <CkRowRO label="Farol baixo" valor={it.ldzDirFarolBaixo} opcoes={OPT_SN} />
                  <CkRowRO label="Neblina" valor={it.ldzDirNeblina} opcoes={OPT_SN} />
                  <CkSecRow label="Esquerda" />
                  <CkRowRO label="Farol alto" valor={it.ldzEsqFarolAlto} opcoes={OPT_SN} />
                  <CkRowRO label="Farol baixo" valor={it.ldzEsqFarolBaixo} opcoes={OPT_SN} />
                  <CkRowRO label="Seta" valor={it.ldzEsqSeta} opcoes={OPT_SN} />
                  <CkRowRO label="Neblina" valor={it.ldzEsqNeblina} opcoes={OPT_SN} />
                </div>
              </div>
            </div>

            <div className="ck-2col" style={{ marginTop: '0.75rem' }}>
              <div className="ck-table-wrap ck-with-side">
                <div className="ck-side-label">Segurança</div>
                <div style={{ flex: 1 }}>
                  <CkHeader cols={['S', 'N', 'N/A']} />
                  {(['segAlarme','segBuzina','segChaveRoda','segCintos','segDocumentos','segExtintor',
                    'segLimpadores','segMacaco','segPainel','segRetrovisorInterno','segRetrovisorDireito',
                    'segRetrovisorEsquerdo','segTravas','segTriangulo'] as (keyof Itens)[]).map((k) => {
                    const labels: Record<string,string> = {
                      segAlarme:'Alarme',segBuzina:'Buzina',segChaveRoda:'Chave de Roda',segCintos:'Cintos',
                      segDocumentos:'Documentos',segExtintor:'Extintor',segLimpadores:'Limpadores',
                      segMacaco:'Macaco',segPainel:'Painel',segRetrovisorInterno:'Retrovisor Int.',
                      segRetrovisorDireito:'Retrovisor Dir.',segRetrovisorEsquerdo:'Retrovisor Esq.',
                      segTravas:'Travas',segTriangulo:'Triângulo',
                    }
                    return <CkRowRO key={k} label={labels[k]} valor={it[k] as string} opcoes={OPT_SN} />
                  })}
                </div>
              </div>
              <div className="ck-table-wrap ck-with-side">
                <div className="ck-side-label">Motor</div>
                <div style={{ flex: 1 }}>
                  <CkHeader cols={['S', 'N', 'N/A']} />
                  {(['motAcelerador','motAguaLimpador','motAguaRadiador','motEmbreagem','motFreio',
                    'motFreioMao','motOleoFreio','motOleoMoto','motTanquePartida'] as (keyof Itens)[]).map((k) => {
                    const labels: Record<string,string> = {
                      motAcelerador:'Acelerador',motAguaLimpador:'Água limpador',motAguaRadiador:'Água radiador',
                      motEmbreagem:'Embreagem',motFreio:'Freio',motFreioMao:'Freio de mão',
                      motOleoFreio:'Óleo do freio',motOleoMoto:'Óleo do motor',motTanquePartida:'Tanque/Partida',
                    }
                    return <CkRowRO key={k} label={labels[k]} valor={it[k] as string} opcoes={OPT_SN} />
                  })}
                </div>
              </div>
            </div>

            {c.observacoes && (
              <div className="campo" style={{ marginTop: '0.75rem' }}>
                <label className="campo-label">📝 Observações</label>
                <div className="cl-obs-text">{c.observacoes}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="conteudo-viatura">
      <div className="cl-lista-header">
        <h2 className="cl-titulo">Checklists da Viatura</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {checklists.length > 0 && (
            <button className="btn-excel-global" onClick={() => exportarChecklistExcel(checklists)}>
              📊 Excel
            </button>
          )}
          <button className="btn-novo-checklist" onClick={() => { resetForm(); setModo('form') }}>
            + Novo
          </button>
        </div>
      </div>

      {carregando ? (
        <div className="carregando">⏳ Carregando checklists...</div>
      ) : checklists.length === 0 ? (
        <div className="lista-vazia">
          <div style={{ fontSize: '3rem' }}>🚗</div>
          <div>Nenhum checklist registrado.</div>
          <button className="btn-nova-vazia" onClick={() => { resetForm(); setModo('form') }}>+ Novo Checklist</button>
        </div>
      ) : (
        <div className="lista">
          {checklists.map((c) => (
            <button key={c.id} className="oc-card" onClick={() => { setSelecionado(c); setModo('detalhe') }}>
              <div className="oc-card-esq"><span className="oc-emoji">🚗</span></div>
              <div className="oc-card-corpo">
                <div className="oc-card-top">
                  <span className="oc-natureza">{formatarData(c.data_checklist)}</span>
                  <span className="oc-seta">›</span>
                </div>
                <div className="oc-card-meta">
                  {c.motorista && <span>👤 {c.motorista}</span>}
                  {c.placa && <span>🚘 {c.placa}</span>}
                  {c.km && <span>🔢 {c.km} km</span>}
                  <span>
                    {[c.foto_frontal, c.foto_traseira, c.foto_direita, c.foto_esquerda].filter(Boolean).length}/4 fotos
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
