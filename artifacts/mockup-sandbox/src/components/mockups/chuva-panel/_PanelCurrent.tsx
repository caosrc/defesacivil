import type { ChangeEvent } from 'react'
import './_PanelCurrent.css'

export type ProdutoRadarRedemet = 'MAXCAPPI' | '3km' | '5km' | '7km' | '10km'

export interface ChuvaCondicaoAtual {
  temperaturaC: number | null
  descricao: string
  umidadePercentual?: number | null
  ventoKmh?: number | null
  probabilidadeChuvaPercentual?: number | null
}

export interface ChuvaPrevisaoHora {
  horario: string
  temperaturaC?: number | null
  probabilidadeChuvaPercentual?: number | null
  descricao?: string
}

export interface ChuvaModeloTrovoada {
  id: string
  nome: string
  proximaIndicacao?: string | null
  indicaTrovoada: boolean
}

export interface ChuvaPrevisaoTrovoada {
  risco: string
  consensoModelos: number
  proximaIndicacao?: string | null
  modelos: ChuvaModeloTrovoada[]
  locaisPrevistos?: number
  atualizadoEm?: string
  status?: string
  erro?: string
  carregando?: boolean
}

export interface ChuvaAlertaOficial {
  id: string
  titulo: string
  nivel?: 'baixo' | 'moderado' | 'alto' | 'severo' | 'extremo' | string
  inicio?: string
  fim?: string
  url?: string
}

export interface ChuvaStatusFonte {
  status?: string
  erro?: string
  atualizadoEm?: string
}

export interface ChuvaPainelProps {
  onClose: () => void

  condicaoAtual?: ChuvaCondicaoAtual | null
  previsaoProximaHora?: ChuvaPrevisaoHora[]
  horarioAtualizado?: string
  condicaoStatus?: string
  condicaoErro?: string
  carregandoCondicoes?: boolean

  previsaoTrovoada?: ChuvaPrevisaoTrovoada | null
  previsaoTrovoadaCarregando?: boolean
  previsaoTrovoadaErro?: string
  camadaTrovoadaAtiva: boolean
  onAlternarCamadaTrovoada: () => void
  alertasOficiais?: ChuvaAlertaOficial[]
  alertasCarregando?: boolean
  alertasErro?: string

  onEnquadrarMinasGerais: () => void
  onVoltarParaOuroBranco: () => void

  rainViewerAtivo: boolean
  onAlternarRainViewer: () => void

  visaoCombinadaAtiva: boolean
  onAlternarVisaoCombinada: () => void
  radarRedemetAtivo: boolean
  onAlternarRadarRedemet: () => void
  produtoRadarRedemet: ProdutoRadarRedemet
  onSelecionarProdutoRadarRedemet: (produto: ProdutoRadarRedemet) => void
  stscAtivo: boolean
  onAlternarStsc: () => void
  redemetIrAtivo: boolean
  onAlternarRedemetIr: () => void
  nuvensGoesAtivas: boolean
  onAlternarNuvensGoes: () => void
  estimativaCemadenAtiva: boolean
  onAlternarEstimativaCemaden: () => void
  pluviometrosAtivos: boolean
  onAlternarPluviometros: () => void

  urlCptecNowcasting?: string
  urlMapaOficialCemaden?: string
  opacidadeChuva: number
  onAlterarOpacidadeChuva: (valor: number) => void
  opacidadeSuperficie: number
  onAlterarOpacidadeSuperficie: (valor: number) => void

  statusFontes?: {
    rainViewer?: ChuvaStatusFonte
    redemetRadar?: ChuvaStatusFonte
    stsc?: ChuvaStatusFonte
    redemetIr?: ChuvaStatusFonte
    goes?: ChuvaStatusFonte
    cemadenEstimativa?: ChuvaStatusFonte
    pluviometros?: ChuvaStatusFonte
  }
  horarioRadarMaisRecente?: string
  horarioCemadenMaisRecente?: string
  maiorChuvaUmaHora?: string
  refreshing?: boolean
  onRefresh: () => void
}

const URL_CPTEC = 'https://nowcasting.cptec.inpe.br/'
const URL_CEMADEN = 'https://mapainterativo.cemaden.gov.br/'

function valorPercentual(valor?: number | null): string {
  return typeof valor === 'number' && Number.isFinite(valor) ? `${Math.round(valor)}%` : '—'
}

function StatusFonte({ fonte }: { fonte?: ChuvaStatusFonte }) {
  if (!fonte?.status && !fonte?.erro && !fonte?.atualizadoEm) return null
  return (
    <span className="chuva-source__state">
      {fonte.status}
      {fonte.atualizadoEm ? <><br />{fonte.atualizadoEm}</> : null}
      {fonte.erro ? <small className="chuva-source__error">{fonte.erro}</small> : null}
    </span>
  )
}

interface FonteAlternavelProps {
  titulo: string
  nota: string
  ativa: boolean
  aoAlternar: () => void
  fonte?: ChuvaStatusFonte
  rotuloLigado?: string
  rotuloDesligado?: string
}

function FonteAlternavel({
  titulo,
  nota,
  ativa,
  aoAlternar,
  fonte,
  rotuloLigado = 'Ativa',
  rotuloDesligado = 'Ativar',
}: FonteAlternavelProps) {
  return (
    <div className="chuva-source">
      <div className="chuva-source__main">
        <span className="chuva-source__title">{titulo}</span>
        <span className="chuva-source__note">{nota}</span>
      </div>
      <button
        type="button"
        className={`chuva-button chuva-source__toggle${ativa ? ' chuva-button--active' : ''}`}
        aria-pressed={ativa}
        onClick={aoAlternar}
      >
        <span className="chuva-switch" aria-hidden="true" />
        {ativa ? rotuloLigado : rotuloDesligado}
      </button>
      <StatusFonte fonte={fonte} />
    </div>
  )
}

export default function ChuvaPainel({
  onClose,
  condicaoAtual,
  previsaoProximaHora = [],
  horarioAtualizado,
  condicaoStatus,
  condicaoErro,
  carregandoCondicoes = false,
  previsaoTrovoada,
  previsaoTrovoadaCarregando = false,
  previsaoTrovoadaErro,
  camadaTrovoadaAtiva,
  onAlternarCamadaTrovoada,
  alertasOficiais = [],
  alertasCarregando = false,
  alertasErro,
  onEnquadrarMinasGerais,
  onVoltarParaOuroBranco,
  rainViewerAtivo,
  onAlternarRainViewer,
  visaoCombinadaAtiva,
  onAlternarVisaoCombinada,
  radarRedemetAtivo,
  onAlternarRadarRedemet,
  produtoRadarRedemet,
  onSelecionarProdutoRadarRedemet,
  stscAtivo,
  onAlternarStsc,
  redemetIrAtivo,
  onAlternarRedemetIr,
  nuvensGoesAtivas,
  onAlternarNuvensGoes,
  estimativaCemadenAtiva,
  onAlternarEstimativaCemaden,
  pluviometrosAtivos,
  onAlternarPluviometros,
  urlCptecNowcasting = URL_CPTEC,
  urlMapaOficialCemaden = URL_CEMADEN,
  opacidadeChuva,
  onAlterarOpacidadeChuva,
  opacidadeSuperficie,
  onAlterarOpacidadeSuperficie,
  statusFontes,
  horarioRadarMaisRecente,
  horarioCemadenMaisRecente,
  maiorChuvaUmaHora,
  refreshing = false,
  onRefresh,
}: ChuvaPainelProps) {
  const alterarProduto = (event: ChangeEvent<HTMLSelectElement>) => {
    onSelecionarProdutoRadarRedemet(event.target.value as ProdutoRadarRedemet)
  }

  return (
    <aside id="mapa-painel-chuva" className="chuva-panel" aria-label="Painel de chuva e meteorologia">
      {refreshing && <div className="chuva-panel__loading" aria-label="Atualizando fontes meteorológicas" />}
      <header className="chuva-panel__header">
        <div>
          <p className="chuva-panel__eyebrow"><span className="chuva-panel__eyebrow-mark" /> Monitoramento local</p>
          <h2 className="chuva-panel__title">Chuva ao vivo</h2>
          <span className="chuva-panel__location">Ouro Branco, MG · observação local</span>
        </div>
        <button type="button" className="chuva-panel__close" onClick={onClose} aria-label="Fechar painel de chuva">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="chuva-panel__scroll">
        <div className="chuva-panel__content">
          <section className="chuva-card" aria-labelledby="chuva-condicoes-title">
            <div className="chuva-card__heading">
              <h3 id="chuva-condicoes-title" className="chuva-card__title">
                <span className="chuva-card__title-mark" aria-hidden="true">01</span>
                Condições e próxima hora
              </h3>
              <span className="chuva-source__state">{horarioAtualizado ? `Atualizado ${horarioAtualizado}` : condicaoStatus}</span>
            </div>
            <div className="chuva-weather">
              {condicaoAtual ? (
                <>
                  <div className="chuva-weather__now">
                    <strong className="chuva-weather__temperature">
                      {condicaoAtual.temperaturaC == null ? '—' : `${Math.round(condicaoAtual.temperaturaC)} °C`}
                    </strong>
                    <div className="chuva-weather__description">
                      <span>{condicaoAtual.descricao}</span>
                      <small>Probabilidade de chuva: {valorPercentual(condicaoAtual.probabilidadeChuvaPercentual)}</small>
                    </div>
                    <div className="chuva-weather__metrics">
                      <span>Umidade {valorPercentual(condicaoAtual.umidadePercentual)}</span>
                      <span>Vento {condicaoAtual.ventoKmh == null ? '—' : `${Math.round(condicaoAtual.ventoKmh)} km/h`}</span>
                    </div>
                  </div>
                  {previsaoProximaHora.length > 0 ? (
                    <div className="chuva-weather__hours" aria-label="Previsão horária">
                      {previsaoProximaHora.slice(0, 6).map((hora, index) => (
                        <div className="chuva-weather__hour" key={`${hora.horario}-${index}`}>
                          <strong>{hora.horario}</strong>
                          <span>{hora.temperaturaC == null ? '—' : `${Math.round(hora.temperaturaC)}°`}</span>
                          <span>{valorPercentual(hora.probabilidadeChuvaPercentual)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="chuva-weather__status">Previsão para a próxima hora indisponível.</div>
                  )}
                </>
              ) : carregandoCondicoes && !condicaoErro ? (
                <div className="chuva-skeleton" role="status" aria-label="Carregando condições locais">
                  <span className="chuva-skeleton__temperature" />
                  <span className="chuva-skeleton__lines">
                    <i />
                    <i />
                  </span>
                  <span className="chuva-skeleton__hours">
                    <i /><i /><i /><i /><i /><i />
                  </span>
                </div>
              ) : (
                <div className="chuva-weather__status" role={condicaoErro ? 'alert' : undefined}>
                  {condicaoErro || 'Condições locais indisponíveis.'}
                </div>
              )}
              {condicaoErro && condicaoAtual && <div className="chuva-weather__status" role="status">{condicaoErro}</div>}
            </div>
          </section>

          <section className="chuva-card" aria-labelledby="chuva-trovoada-title">
            <div className="chuva-card__heading">
              <h3 id="chuva-trovoada-title" className="chuva-card__title">
                <span className="chuva-card__title-mark" aria-hidden="true">02</span>
                Previsão de raios e trovoadas
              </h3>
              <button
                type="button"
                className={`chuva-button${camadaTrovoadaAtiva ? ' chuva-button--active' : ''}`}
                aria-pressed={camadaTrovoadaAtiva}
                onClick={onAlternarCamadaTrovoada}
              >
                {camadaTrovoadaAtiva ? 'Raios no mapa' : 'Exibir no mapa'}
              </button>
            </div>
            <p className="chuva-card__caption">Previsão de modelos para localidades de Minas Gerais, não detecção de descargas.</p>
            {previsaoTrovoada ? (
              <>
                <div className="chuva-summary">
                  <div className="chuva-summary__item">
                    <span className="chuva-summary__label">Risco agora</span>
                    <strong className="chuva-summary__value chuva-summary__value--risk">{previsaoTrovoada.risco}</strong>
                  </div>
                  <div className="chuva-summary__item">
                    <span className="chuva-summary__label">Consenso</span>
                    <strong className="chuva-summary__value">{previsaoTrovoada.consensoModelos}/3 modelos</strong>
                  </div>
                  <div className="chuva-summary__item">
                    <span className="chuva-summary__label">Próxima indicação</span>
                    <strong className="chuva-summary__value">{previsaoTrovoada.proximaIndicacao || 'Sem indicação'}</strong>
                  </div>
                </div>
                <div className="chuva-models" aria-label="Indicação por modelo meteorológico">
                  {previsaoTrovoada.modelos.slice(0, 3).map(modelo => (
                    <div className="chuva-models__row" key={modelo.id}>
                      <span>{modelo.nome}</span>
                      <strong data-risk={modelo.indicaTrovoada}>
                        {modelo.proximaIndicacao || 'Sem trovoada prevista'}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className="chuva-card__heading">
                  <span className="chuva-source__state">
                    {previsaoTrovoada.locaisPrevistos == null
                      ? 'Abrangência estadual'
                      : `${previsaoTrovoada.locaisPrevistos} locais previstos`}
                  </span>
                  <button type="button" className="chuva-button" onClick={onEnquadrarMinasGerais}>Ver MG</button>
                </div>
                {(previsaoTrovoada.erro || previsaoTrovoadaErro || previsaoTrovoada.status) && (
                  <p className="chuva-card__footnote" role={previsaoTrovoada.erro ? 'alert' : 'status'}>
                    {previsaoTrovoada.erro || previsaoTrovoadaErro || previsaoTrovoada.status}
                    {previsaoTrovoada.atualizadoEm ? ` · última previsão ${previsaoTrovoada.atualizadoEm}` : ''}
                  </p>
                )}
              </>
            ) : previsaoTrovoadaCarregando ? (
              <div className="chuva-skeleton chuva-skeleton--forecast" role="status" aria-label="Carregando previsão de trovoadas">
                <span className="chuva-skeleton__temperature" />
                <span className="chuva-skeleton__lines"><i /><i /></span>
                <span className="chuva-skeleton__hours"><i /><i /><i /></span>
              </div>
            ) : (
              <p className="chuva-card__footnote" role={previsaoTrovoadaErro ? 'alert' : 'status'}>
                {previsaoTrovoadaErro || 'Previsão de trovoadas indisponível.'}
              </p>
            )}
          </section>

          <section className="chuva-card" aria-labelledby="chuva-alertas-title">
            <div className="chuva-card__heading">
              <h3 id="chuva-alertas-title" className="chuva-card__title">
                <span className="chuva-card__title-mark" aria-hidden="true">03</span>
                Alertas oficiais
              </h3>
              <span className="chuva-source__state">{alertasCarregando ? 'Consultando INMET' : 'INMET'}</span>
            </div>
            <div className="chuva-alerts">
              {alertasOficiais.length ? alertasOficiais.map(alerta => (
                <a
                  className="chuva-alerts__item"
                  data-level={alerta.nivel || 'moderado'}
                  href={alerta.url || '#alertas'}
                  key={alerta.id}
                  target={alerta.url ? '_blank' : undefined}
                  rel={alerta.url ? 'noreferrer' : undefined}
                  onClick={event => { if (!alerta.url) event.preventDefault() }}
                >
                  <strong>{alerta.titulo}</strong>
                  <span>
                    {alerta.inicio ? `Início ${alerta.inicio}` : 'Aviso vigente'}
                    {alerta.fim ? ` · até ${alerta.fim}` : ''}
                  </span>
                </a>
              )) : (
                <span className="chuva-alerts__empty">
                  {alertasCarregando ? 'Verificando avisos oficiais para Ouro Branco…' : 'Nenhum aviso oficial informado para Ouro Branco.'}
                </span>
              )}
              {alertasErro && <span className="chuva-alerts__error" role="alert">{alertasErro}</span>}
            </div>
          </section>

          <section className="chuva-card" aria-label="Enquadramento do mapa">
            <div className="chuva-map-actions">
              <button type="button" className="chuva-button" onClick={onEnquadrarMinasGerais}>Enquadrar toda MG</button>
              <button type="button" className="chuva-button" onClick={onVoltarParaOuroBranco}>Voltar para Ouro Branco</button>
            </div>
          </section>

          <section className="chuva-card" aria-labelledby="chuva-camadas-title">
            <div className="chuva-card__heading">
              <h3 id="chuva-camadas-title" className="chuva-card__title">
                <span className="chuva-card__title-mark" aria-hidden="true">04</span>
                Camadas e fontes
              </h3>
            </div>
            <p className="chuva-card__caption">Ative as fontes que deseja comparar no mapa.</p>
            <div className="chuva-source-list">
              <FonteAlternavel
                titulo="RainViewer · radar observado"
                nota="Quadros observados de precipitação; não é previsão."
                ativa={rainViewerAtivo}
                aoAlternar={onAlternarRainViewer}
                fonte={statusFontes?.rainViewer}
              />

              <div className="chuva-source">
                <div className="chuva-source__main">
                  <span className="chuva-source__title">Visão combinada</span>
                  <span className="chuva-source__note">RainViewer, REDEMET e fontes CEMADEN selecionadas em conjunto.</span>
                </div>
                <button
                  type="button"
                  className={`chuva-button chuva-source__toggle${visaoCombinadaAtiva ? ' chuva-button--active' : ''}`}
                  aria-pressed={visaoCombinadaAtiva}
                  onClick={onAlternarVisaoCombinada}
                >
                  <span className="chuva-switch" aria-hidden="true" />
                  {visaoCombinadaAtiva ? 'Ativa' : 'Ativar'}
                </button>
              </div>

              <div className="chuva-source">
                <div className="chuva-source__main">
                  <span className="chuva-source__title">REDEMET · radar meteorológico</span>
                  <span className="chuva-source__note">Ecos observados pelo radar; produtos em diferentes alturas.</span>
                </div>
                <button
                  type="button"
                  className={`chuva-button chuva-source__toggle${radarRedemetAtivo ? ' chuva-button--active' : ''}`}
                  aria-pressed={radarRedemetAtivo}
                  onClick={onAlternarRadarRedemet}
                >
                  <span className="chuva-switch" aria-hidden="true" />
                  {radarRedemetAtivo ? 'Ativo' : 'Ativar'}
                </button>
                <div className="chuva-product-row">
                  <label htmlFor="chuva-produto-redemet">Produto REDEMET</label>
                  <select id="chuva-produto-redemet" value={produtoRadarRedemet} onChange={alterarProduto}>
                    <option value="MAXCAPPI">MAXCAPPI</option>
                    <option value="3km">CAPPI · 3 km</option>
                    <option value="5km">CAPPI · 5 km</option>
                    <option value="7km">CAPPI · 7 km</option>
                    <option value="10km">CAPPI · 10 km</option>
                  </select>
                </div>
                <StatusFonte fonte={statusFontes?.redemetRadar} />
              </div>

              <FonteAlternavel
                titulo="REDEMET STSC"
                nota="Registro de ocorrências de trovoada; não confundir com previsão."
                ativa={stscAtivo}
                aoAlternar={onAlternarStsc}
                fonte={statusFontes?.stsc}
              />
              <FonteAlternavel
                titulo="REDEMET IR"
                nota="Imagem infravermelha de nuvens; não mede chuva no solo."
                ativa={redemetIrAtivo}
                aoAlternar={onAlternarRedemetIr}
                fonte={statusFontes?.redemetIr}
              />
              <div className="chuva-source">
                <div className="chuva-source__main">
                  <span className="chuva-source__title">CPTEC Nowcasting</span>
                  <span className="chuva-source__note">Previsão de curtíssimo prazo no portal oficial; não é camada deste mapa.</span>
                </div>
                <a className="chuva-button" href={urlCptecNowcasting} target="_blank" rel="noreferrer">
                  Abrir CPTEC
                </a>
              </div>
              <FonteAlternavel
                titulo="NOAA GOES · infravermelho"
                nota="Imagem de nuvens; não confirma precipitação no solo."
                ativa={nuvensGoesAtivas}
                aoAlternar={onAlternarNuvensGoes}
                fonte={statusFontes?.goes}
              />
              <FonteAlternavel
                titulo="CEMADEN · estimativa por satélite"
                nota="Estimativa raster de chuva; não é medição de pluviômetro."
                ativa={estimativaCemadenAtiva}
                aoAlternar={onAlternarEstimativaCemaden}
                fonte={statusFontes?.cemadenEstimativa}
              />
              <FonteAlternavel
                titulo="CEMADEN · pluviômetros"
                nota="Medições pontuais de estações; disponibilidade e horários variam."
                ativa={pluviometrosAtivos}
                aoAlternar={onAlternarPluviometros}
                fonte={statusFontes?.pluviometros}
              />
              <a className="chuva-button chuva-button--wide" href={urlMapaOficialCemaden} target="_blank" rel="noreferrer">
                Abrir mapa oficial do CEMADEN
              </a>
            </div>
            <div className="chuva-opacity">
              <label className="chuva-opacity__row" htmlFor="chuva-opacidade-radar">
                <span>Chuva / radar</span>
                <input
                  id="chuva-opacidade-radar"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={opacidadeChuva}
                  onChange={event => onAlterarOpacidadeChuva(Number(event.target.value))}
                />
                <output>{Math.round(opacidadeChuva)}%</output>
              </label>
              <label className="chuva-opacity__row" htmlFor="chuva-opacidade-superficie">
                <span>Superfície</span>
                <input
                  id="chuva-opacidade-superficie"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={opacidadeSuperficie}
                  onChange={event => onAlterarOpacidadeSuperficie(Number(event.target.value))}
                />
                <output>{Math.round(opacidadeSuperficie)}%</output>
              </label>
            </div>
            <div className="chuva-observations" aria-label="Últimas atualizações de chuva">
              <div className="chuva-observations__cell">
                <span>Radar observado</span>
                <strong>{horarioRadarMaisRecente || 'Sem horário recente'}</strong>
              </div>
              <div className="chuva-observations__cell">
                <span>CEMADEN</span>
                <strong>{horarioCemadenMaisRecente || 'Sem horário recente'}</strong>
              </div>
              <div className="chuva-observations__cell">
                <span>Chuva em 1 h</span>
                <strong>{maiorChuvaUmaHora || 'Sem leitura'}</strong>
              </div>
            </div>
            <p className="chuva-panel__notice">
              RainViewer e REDEMET exibem observações de radar em horários próprios; a defasagem da imagem não indica o instante exato da chuva. Nowcasting e modelos são previsões. GOES/REDEMET IR mostram nuvens, CEMADEN por satélite estima precipitação e pluviômetros medem chuva em pontos específicos. Compare fontes antes de decidir a operação.
            </p>
            <div className="chuva-panel__refresh">
              <button
                type="button"
                className="chuva-button chuva-button--primary chuva-button--wide"
                onClick={onRefresh}
                disabled={refreshing}
              >
                {refreshing ? 'Atualizando fontes…' : 'Atualizar fontes'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </aside>
  )
}
