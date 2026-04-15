import { useState, useRef, useEffect } from 'react'

const LOGIN_KEY = 'defesacivil-logado'
const USUARIO_CORRETO = 'defesacivilob@gmail.com'
const SENHA_CORRETA = 'dc-2026'

export function estaLogado(): boolean {
  return localStorage.getItem(LOGIN_KEY) === '1'
}

export function fazerLogout() {
  localStorage.removeItem(LOGIN_KEY)
}

interface Props {
  onLogin: () => void
}

export default function Login({ onLogin }: Props) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const usuarioRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => usuarioRef.current?.focus(), 100)
  }, [])

  function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    setTimeout(() => {
      if (
        usuario.trim().toLowerCase() === USUARIO_CORRETO &&
        senha === SENHA_CORRETA
      ) {
        localStorage.setItem(LOGIN_KEY, '1')
        onLogin()
      } else {
        setErro('Usuário ou senha incorretos.')
        setSenha('')
        setCarregando(false)
      }
    }, 600)
  }

  return (
    <div className="login-tela">
      <div className="login-box">
        <div className="login-logo-wrap">
          <img src="/icon-512.png" alt="Defesa Civil Ouro Branco" className="login-logo" />
        </div>
        <div className="login-titulo">Defesa Civil</div>
        <div className="login-subtitulo">Ouro Branco — MG</div>

        <form className="login-form" onSubmit={entrar} autoComplete="off">
          <div className="login-campo">
            <label className="login-label">Usuário</label>
            <input
              ref={usuarioRef}
              className={`login-input${erro ? ' login-input-erro' : ''}`}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="email@exemplo.com"
              value={usuario}
              onChange={(e) => { setUsuario(e.target.value); setErro('') }}
            />
          </div>

          <div className="login-campo">
            <label className="login-label">Senha</label>
            <input
              className={`login-input${erro ? ' login-input-erro' : ''}`}
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setErro('') }}
            />
          </div>

          {erro && <div className="login-erro">{erro}</div>}

          <button
            className="login-btn"
            type="submit"
            disabled={carregando || !usuario.trim() || !senha}
          >
            {carregando ? '⏳ Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
