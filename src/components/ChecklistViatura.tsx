import { useState, useEffect, useRef } from 'react'
import { adicionarMarcaDagua } from '../utils'

const MOTORISTAS_CL = ['Moisés', 'Valteir', 'Arthur', 'Gustavo', 'Dyonathan']

interface Checklist {
  id: number
  data_checklist: string
  km: string | null
  motorista: string | null
  fotos_avarias: string[]
  foto_principal: string | null
  foto_frontal: string | null
  foto_traseira: string | null
  foto_direita: string | null
  foto_esquerda: string | null
  observacoes: string | null
  created_at: string
}

type Modo = 'lista' | 'form' | 'detalhe'

function CarTop() {
  return (
    <svg viewBox="0 0 80 130" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="104">
      <rect x="0" y="22" width="11" height="20" rx="3" fill="#94a3b8"/>
      <rect x="69" y="22" width="11" height="20" rx="3" fill="#94a3b8"/>
      <rect x="0" y="88" width="11" height="20" rx="3" fill="#94a3b8"/>
      <rect x="69" y="88" width="11" height="20" rx="3" fill="#94a3b8"/>
      <rect x="9" y="12" width="62" height="106" rx="18" fill="#cbd5e1"/>
      <rect x="18" y="28" width="44" height="30" rx="4" fill="#bfdbfe" opacity="0.9"/>
      <rect x="18" y="72" width="44" height="24" rx="4" fill="#bfdbfe" opacity="0.9"/>
      <rect x="24" y="60" width="32" height="12" rx="3" fill="#94a3b8"/>
    </svg>
  )
}

function CarFront() {
  return (
    <svg viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg" width="100" height="62">
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
    <svg viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg" width="100" height="62">
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
    <svg viewBox="0 0 160 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="130" height="65"
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

interface SlotProps {
  label: string
  foto: string | null
  onFoto: (b64: string) => void
  children: React.ReactNode
  large?: boolean
}

function FotoSlot({ label, foto, onFoto, children, large }: SlotProps) {
  const ref = useRef<HTMLInputElement>(null)
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      if (ev.target?.result) {
        const comMarca = await adicionarMarcaDagua(ev.target.result as string)
        onFoto(comMarca)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }
  return (
    <div className={`cl-slot ${large ? 'cl-slot-large' : ''}`} onClick={() => ref.current?.click()}>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleChange} />
      {foto ? (
        <img src={foto} alt={label} className="cl-slot-foto" />
      ) : (
        <div className="cl-slot-vazio">
          <div className="cl-slot-icon">{children}</div>
          <div className="cl-slot-label">{label}</div>
          <div className="cl-slot-hint">📷 Toque para fotografar</div>
        </div>
      )}
      {foto && <div className="cl-slot-nome">{label}</div>}
    </div>
  )
}

export default function ChecklistViatura() {
  const [modo, setModo] = useState<Modo>('lista')
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<Checklist | null>(null)

  const hoje = new Date().toISOString().split('T')[0]
  const [data, setData] = useState(hoje)
  const [km, setKm] = useState('')
  const [motorista, setMotorista] = useState('')
  const [fotosAvarias, setFotosAvarias] = useState<string[]>([])
  const [fotoPrincipal, setFotoPrincipal] = useState<string | null>(null)
  const [fotoFrontal, setFotoFrontal] = useState<string | null>(null)
  const [fotoTraseira, setFotoTraseira] = useState<string | null>(null)
  const [fotoDireita, setFotoDireita] = useState<string | null>(null)
  const [fotoEsquerda, setFotoEsquerda] = useState<string | null>(null)
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [showMotoristas, setShowMotoristas] = useState(false)
  const avariaRef = useRef<HTMLInputElement>(null)

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
    setData(hoje)
    setKm('')
    setMotorista('')
    setFotosAvarias([])
    setFotoPrincipal(null)
    setFotoFrontal(null)
    setFotoTraseira(null)
    setFotoDireita(null)
    setFotoEsquerda(null)
    setObservacoes('')
    setErro('')
  }

  function adicionarAvaria(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        if (ev.target?.result) {
          const comMarca = await adicionarMarcaDagua(ev.target.result as string)
          setFotosAvarias((p) => [...p, comMarca])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  async function salvar() {
    if (!motorista) { setErro('Selecione o motorista.'); return }
    setSalvando(true)
    setErro('')
    try {
      await fetch('/api/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_checklist: data,
          km,
          motorista,
          fotos_avarias: fotosAvarias,
          foto_principal: fotoPrincipal,
          foto_frontal: fotoFrontal,
          foto_traseira: fotoTraseira,
          foto_direita: fotoDireita,
          foto_esquerda: fotoEsquerda,
          observacoes: observacoes || null,
        }),
      })
      await carregar()
      resetForm()
      setModo('lista')
    } catch {
      setErro('Erro ao salvar. Tente novamente.')
    }
    setSalvando(false)
  }

  async function deletar(id: number) {
    if (!confirm('Excluir este checklist?')) return
    await fetch(`/api/checklists/${id}`, { method: 'DELETE' })
    setSelecionado(null)
    setModo('lista')
    await carregar()
  }

  function formatarData(iso: string) {
    const [y, m, d] = iso.split('-')
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const dt = new Date(`${iso}T12:00:00`)
    return `${dias[dt.getDay()]}, ${d}/${m}/${y}`
  }

  if (modo === 'form') {
    return (
      <div className="tela">
        <header className="header">
          <button className="btn-voltar" onClick={() => { resetForm(); setModo('lista') }}>‹</button>
          <div className="header-logo-mini">
            <span style={{ fontSize: '1.4rem' }}>🚗</span>
            <span className="header-titulo-texto">Checklist da Viatura</span>
          </div>
          <div style={{ width: 36 }} />
        </header>

        <div className="form-scroll">
          <div className="form-card">

            {/* Data + KM */}
            <div className="cl-row-2">
              <div className="campo" style={{ flex: 1 }}>
                <label className="campo-label">📅 Data do Checklist</label>
                <input className="campo-input" type="date" value={data} max={hoje}
                  onChange={(e) => setData(e.target.value)} />
              </div>
              <div className="campo" style={{ flex: 1 }}>
                <label className="campo-label">🔢 Quilometragem</label>
                <input className="campo-input" type="text" inputMode="numeric" placeholder="Ex: 52.340"
                  value={km} onChange={(e) => setKm(e.target.value)} />
              </div>
            </div>

            {/* Motorista */}
            <div className="campo">
              <label className="campo-label">👤 Motorista</label>
              <div className="cl-motorista-box" onClick={() => setShowMotoristas(true)}>
                <span className={motorista ? 'cl-motorista-selecionado' : 'cl-motorista-placeholder'}>
                  {motorista || 'Selecionar motorista...'}
                </span>
                <span className="cl-motorista-arrow">▾</span>
              </div>
              {showMotoristas && (
                <div className="cl-motorista-lista">
                  {MOTORISTAS_CL.map((nome) => (
                    <button key={nome} className={`cl-motorista-item ${motorista === nome ? 'ativo' : ''}`}
                      onClick={() => { setMotorista(nome); setShowMotoristas(false) }}>
                      {motorista === nome ? '✅ ' : ''}{nome}
                    </button>
                  ))}
                  <button className="cl-motorista-item cl-motorista-fechar"
                    onClick={() => setShowMotoristas(false)}>Cancelar</button>
                </div>
              )}
            </div>

            {/* Fotos de Avarias */}
            <div className="campo">
              <label className="campo-label">🔧 Fotos de Avarias</label>
              <div className="fotos-area">
                {fotosAvarias.map((f, i) => (
                  <div key={i} className="foto-wrap">
                    <img src={f} alt="" className="foto-thumb" />
                    <button className="foto-del" onClick={() => setFotosAvarias((p) => p.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
                <button className="btn-add-foto" onClick={() => avariaRef.current?.click()}>
                  <span className="btn-foto-emoji">📷</span>
                  <span>Adicionar Avaria</span>
                </button>
                <input ref={avariaRef} type="file" accept="image/*" multiple capture="environment"
                  style={{ display: 'none' }} onChange={adicionarAvaria} />
              </div>
            </div>

            {/* Fotos da Entrada */}
            <div className="campo">
              <label className="campo-label">🚗 Fotos da Entrada do Veículo</label>
              <p className="cl-dica">Toque em cada ângulo para fotografar o veículo</p>

              <FotoSlot label="Principal" foto={fotoPrincipal} onFoto={setFotoPrincipal} large>
                <CarTop />
              </FotoSlot>

              <div className="cl-grid-2">
                <FotoSlot label="Frontal" foto={fotoFrontal} onFoto={setFotoFrontal}>
                  <CarFront />
                </FotoSlot>
                <FotoSlot label="Traseira" foto={fotoTraseira} onFoto={setFotoTraseira}>
                  <CarRear />
                </FotoSlot>
                <FotoSlot label="Direita" foto={fotoDireita} onFoto={setFotoDireita}>
                  <CarSide />
                </FotoSlot>
                <FotoSlot label="Esquerda" foto={fotoEsquerda} onFoto={setFotoEsquerda}>
                  <CarSide flip />
                </FotoSlot>
              </div>
            </div>

            {/* Observações */}
            <div className="campo">
              <label className="campo-label">📝 Observações</label>
              <textarea className="campo-textarea" rows={4}
                placeholder="Descreva observações sobre a viatura..."
                value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
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
    const angulos = [
      { label: 'Principal', foto: c.foto_principal, icone: <CarTop /> },
      { label: 'Frontal', foto: c.foto_frontal, icone: <CarFront /> },
      { label: 'Traseira', foto: c.foto_traseira, icone: <CarRear /> },
      { label: 'Direita', foto: c.foto_direita, icone: <CarSide /> },
      { label: 'Esquerda', foto: c.foto_esquerda, icone: <CarSide flip /> },
    ]
    return (
      <div className="tela">
        <header className="header">
          <button className="btn-voltar" onClick={() => { setSelecionado(null); setModo('lista') }}>‹</button>
          <div className="header-logo-mini">
            <span style={{ fontSize: '1.4rem' }}>🚗</span>
            <span className="header-titulo-texto">Checklist #{c.id}</span>
          </div>
          <button className="btn-deletar-header" onClick={() => deletar(c.id)}>🗑️</button>
        </header>

        <div className="form-scroll">
          <div className="form-card">
            <div className="cl-detalhe-header">
              <div className="cl-detalhe-data">{formatarData(c.data_checklist)}</div>
              {c.km && <div className="cl-detalhe-km">🔢 {c.km} km</div>}
            </div>
            {c.motorista && (
              <div className="cl-detalhe-row"><span className="cl-detalhe-icon">👤</span><span>{c.motorista}</span></div>
            )}

            {c.fotos_avarias && c.fotos_avarias.length > 0 && (
              <div className="campo">
                <label className="campo-label">🔧 Fotos de Avarias ({c.fotos_avarias.length})</label>
                <div className="fotos-grid">
                  {c.fotos_avarias.map((f, i) => (
                    <img key={i} src={f} alt={`Avaria ${i + 1}`} className="foto-detalhe" />
                  ))}
                </div>
              </div>
            )}

            <div className="campo">
              <label className="campo-label">🚗 Fotos da Entrada</label>
              <div className="cl-angulos-detalhe">
                {angulos.map(({ label, foto, icone }) => (
                  <div key={label} className="cl-angulo-item">
                    {foto
                      ? <img src={foto} alt={label} className="cl-angulo-foto" />
                      : <div className="cl-angulo-vazio">{icone}</div>}
                    <div className="cl-angulo-label">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {c.observacoes && (
              <div className="campo">
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
        <button className="btn-novo-checklist" onClick={() => { resetForm(); setModo('form') }}>
          + Novo
        </button>
      </div>

      {carregando ? (
        <div className="carregando">⏳ Carregando checklists...</div>
      ) : checklists.length === 0 ? (
        <div className="lista-vazia">
          <div style={{ fontSize: '3rem' }}>🚗</div>
          <div>Nenhum checklist registrado.</div>
          <button className="btn-nova-vazia" onClick={() => { resetForm(); setModo('form') }}>
            + Novo Checklist
          </button>
        </div>
      ) : (
        <div className="lista">
          {checklists.map((c) => (
            <button key={c.id} className="oc-card" onClick={() => { setSelecionado(c); setModo('detalhe') }}>
              <div className="oc-card-esq">
                <span className="oc-emoji">🚗</span>
              </div>
              <div className="oc-card-corpo">
                <div className="oc-card-top">
                  <span className="oc-natureza">{formatarData(c.data_checklist)}</span>
                  <span className="oc-seta">›</span>
                </div>
                <div className="oc-card-meta">
                  {c.motorista && <span>👤 {c.motorista}</span>}
                  {c.km && <span>🔢 {c.km} km</span>}
                  <span>
                    {[c.foto_principal, c.foto_frontal, c.foto_traseira, c.foto_direita, c.foto_esquerda].filter(Boolean).length}/5 fotos
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
