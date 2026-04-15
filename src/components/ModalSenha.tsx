import { useState, useEffect, useRef } from 'react'

interface Props {
  titulo: string
  onConfirmar: () => void
  onCancelar: () => void
}

const SENHA_CORRETA = '093067'

export default function ModalSenha({ titulo, onConfirmar, onCancelar }: Props) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  function confirmar() {
    if (senha === SENHA_CORRETA) {
      onConfirmar()
    } else {
      setErro(true)
      setSenha('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="senha-overlay" onClick={onCancelar}>
      <div className="senha-box" onClick={(e) => e.stopPropagation()}>
        <div className="senha-titulo">🔒 {titulo}</div>
        <div className="senha-desc">Digite a senha para continuar</div>
        <input
          ref={inputRef}
          className={`senha-input${erro ? ' senha-input-erro' : ''}`}
          type="password"
          inputMode="numeric"
          placeholder="••••••"
          value={senha}
          onChange={(e) => { setSenha(e.target.value); setErro(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmar() }}
          maxLength={20}
        />
        {erro && <div className="senha-erro">Senha incorreta. Tente novamente.</div>}
        <div className="senha-acoes">
          <button className="senha-btn-cancelar" onClick={onCancelar}>Cancelar</button>
          <button className="senha-btn-confirmar" onClick={confirmar}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}
