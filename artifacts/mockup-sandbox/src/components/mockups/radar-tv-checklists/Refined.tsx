import './_group.css'
import './Refined.css'

const resumos = [
  {
    agente: 'Ana Paula',
    tiposVerificados: 8,
    totalTipos: 10,
    itensConferidos: 18,
    itensCadastrados: 20,
    boa: 5,
    media: 2,
    ruim: 1,
    ferramentasRuins: ['Motosserra'],
    faltantes: ['2 capacetes — Onde está: depósito'],
    serragemAlertas: [],
    litrosAlertas: [],
    semChecklist: ['Machado', 'Lanterna'],
  },
  {
    agente: 'Carlos Henrique',
    tiposVerificados: 10,
    totalTipos: 10,
    itensConferidos: 24,
    itensCadastrados: 24,
    boa: 8,
    media: 2,
    ruim: 0,
    ferramentasRuins: [],
    faltantes: [],
    serragemAlertas: ['2 saco(s) de serragem — Repor serragem'],
    litrosAlertas: [],
    semChecklist: [],
  },
  {
    agente: 'Mariana Souza',
    tiposVerificados: 7,
    totalTipos: 10,
    itensConferidos: 16,
    itensCadastrados: 20,
    boa: 4,
    media: 2,
    ruim: 1,
    ferramentasRuins: ['Bomba costal'],
    faltantes: ['1 rádio — Justificativa: em manutenção'],
    serragemAlertas: [],
    litrosAlertas: ['6 litro(s) de gasolina — Repor estoque'],
    semChecklist: ['Enxada', 'Corda', 'Lanterna'],
  },
]

function percentual(valor: number, total: number) {
  return total > 0 ? Math.round((valor / total) * 100) : 0
}

export function Refined() {
  return (
    <main className="preview-shell">
      <p className="preview-context">MODO TV · RADAR DC · LEITURA RÁPIDA</p>
      <section className="radar-activities radar-activities-refined">
        <header className="radar-ferramental-heading">
          <div>
            <span>INVENTÁRIO OPERACIONAL</span>
            <h3>Checklists de ferramentas</h3>
          </div>
          <strong>{resumos.length}<small> agentes</small></strong>
        </header>
        <div className="radar-ferramental-resumos">
          {resumos.map(resumo => (
            <article className="radar-ferramental-resumo radar-ferramental-resumo-refined" key={resumo.agente}>
              <div className="radar-ferramental-cabecalho">
                <strong>{resumo.agente}</strong>
                <b>{resumo.tiposVerificados}/{resumo.totalTipos} conferidos</b>
              </div>
              {(resumo.boa + resumo.media + resumo.ruim) > 0 && (
                <div className="radar-ferramental-itens" aria-label="Condição das ferramentas">
                  <span className="radar-ferramental-boa">Boa {percentual(resumo.boa, resumo.totalTipos)}%</span>
                  <span className="radar-ferramental-media">Média {percentual(resumo.media, resumo.totalTipos)}%</span>
                  <span className="radar-ferramental-ruim">Ruim {percentual(resumo.ruim, resumo.totalTipos)}%</span>
                </div>
              )}
              <div className="radar-ferramental-quantidade">
                Itens conferidos <b>{resumo.itensConferidos}/{resumo.itensCadastrados}</b>
              </div>
              <div className="radar-ferramental-alertas">
                {resumo.ferramentasRuins.length > 0 && (
                  <div className="radar-ferramental-alerta radar-ferramental-alerta-ruim">
                    <strong>Ruim</strong><span>{resumo.ferramentasRuins.join(', ')}</span>
                  </div>
                )}
                {resumo.faltantes.length > 0 && (
                  <div className="radar-ferramental-alerta radar-ferramental-alerta-falta">
                    <strong>Faltando</strong><span>{resumo.faltantes.join(', ')}</span>
                  </div>
                )}
                {resumo.serragemAlertas.length > 0 && (
                  <div className="radar-ferramental-alerta radar-ferramental-alerta-serragem">
                    <strong>Serragem</strong><span>{resumo.serragemAlertas.join(', ')}</span>
                  </div>
                )}
                {resumo.litrosAlertas.length > 0 && (
                  <div className="radar-ferramental-alerta radar-ferramental-alerta-serragem">
                    <strong>Estoque baixo</strong><span>{resumo.litrosAlertas.join(', ')}</span>
                  </div>
                )}
                {resumo.semChecklist.length > 0 && (
                  <div className="radar-ferramental-alerta radar-ferramental-alerta-pendente">
                    <strong>Sem checklist</strong>
                    <span>{resumo.semChecklist.slice(0, 3).join(', ')}{resumo.semChecklist.length > 3 ? ` +${resumo.semChecklist.length - 3}` : ''}</span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
