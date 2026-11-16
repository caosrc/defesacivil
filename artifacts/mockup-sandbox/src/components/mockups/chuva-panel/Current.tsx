import { useState } from 'react';
import PanelCurrent, { type ProdutoRadarRedemet } from './_PanelCurrent';
import './_group.css';

const horas = [
  { horario: '10:00', temperaturaC: 25, probabilidadeChuvaPercentual: 7 },
  { horario: '11:00', temperaturaC: 25, probabilidadeChuvaPercentual: 16 },
  { horario: '12:00', temperaturaC: 24, probabilidadeChuvaPercentual: 25 },
  { horario: '13:00', temperaturaC: 24, probabilidadeChuvaPercentual: 31 },
  { horario: '14:00', temperaturaC: 22, probabilidadeChuvaPercentual: 34 },
  { horario: '15:00', temperaturaC: 22, probabilidadeChuvaPercentual: 40 },
];

export function Current() {
  const [rain, setRain] = useState(true);
  const [combined, setCombined] = useState(false);
  const [radar, setRadar] = useState(false);
  const [stsc, setStsc] = useState(false);
  const [ir, setIr] = useState(false);
  const [goes, setGoes] = useState(false);
  const [estimate, setEstimate] = useState(false);
  const [stations, setStations] = useState(false);
  const [lightning, setLightning] = useState(false);
  const [product, setProduct] = useState<ProdutoRadarRedemet>('MAXCAPPI');
  const [opacity, setOpacity] = useState(72);
  const [surface, setSurface] = useState(52);
  return <div className="chuva-preview-shell"><PanelCurrent
    onClose={() => {}}
    condicaoAtual={{ temperaturaC: 24, descricao: 'Predominantemente limpo', umidadePercentual: 70, ventoKmh: 16.1, probabilidadeChuvaPercentual: 25 }}
    previsaoProximaHora={horas}
    horarioAtualizado="09:50"
    condicaoStatus="Open-Meteo · Ouro Branco"
    camadaTrovoadaAtiva={lightning}
    onAlternarCamadaTrovoada={() => setLightning(value => !value)}
    previsaoTrovoada={{ risco: 'Baixo', consensoModelos: 0, proximaIndicacao: 'Sem indicação', modelos: [{ id: 'ecmwf', nome: 'ECMWF IFS', indicaTrovoada: false }, { id: 'gfs', nome: 'GFS Global', proximaIndicacao: '14:00', indicaTrovoada: true }, { id: 'icon', nome: 'DWD ICON Global', proximaIndicacao: '12:00', indicaTrovoada: true }], locaisPrevistos: 16, atualizadoEm: '09:50' }}
    alertasOficiais={[{ id: 'tempestade', titulo: 'Tempestade', nivel: 'moderado', inicio: '08:55' }]}
    alertasCarregando={false}
    onEnquadrarMinasGerais={() => {}}
    onVoltarParaOuroBranco={() => {}}
    rainViewerAtivo={rain}
    onAlternarRainViewer={() => setRain(value => !value)}
    visaoCombinadaAtiva={combined}
    onAlternarVisaoCombinada={() => setCombined(value => !value)}
    radarRedemetAtivo={radar}
    onAlternarRadarRedemet={() => setRadar(value => !value)}
    produtoRadarRedemet={product}
    onSelecionarProdutoRadarRedemet={setProduct}
    stscAtivo={stsc}
    onAlternarStsc={() => setStsc(value => !value)}
    redemetIrAtivo={ir}
    onAlternarRedemetIr={() => setIr(value => !value)}
    nuvensGoesAtivas={goes}
    onAlternarNuvensGoes={() => setGoes(value => !value)}
    estimativaCemadenAtiva={estimate}
    onAlternarEstimativaCemaden={() => setEstimate(value => !value)}
    pluviometrosAtivos={stations}
    onAlternarPluviometros={() => setStations(value => !value)}
    opacidadeChuva={opacity}
    onAlterarOpacidadeChuva={setOpacity}
    opacidadeSuperficie={surface}
    onAlterarOpacidadeSuperficie={setSurface}
    statusFontes={{ rainViewer: { status: 'Quadro observado disponível', atualizadoEm: '09:50' }, redemetRadar: { status: 'Ativar para consultar' }, stsc: { status: '44 posições' }, redemetIr: { status: 'Imagem disponível' }, goes: { status: 'Atualização automática' }, cemadenEstimativa: { status: 'Estimativa por satélite' }, pluviometros: { status: '7 estações próximas' } }}
    horarioRadarMaisRecente="09:50 · há 2 min"
    horarioCemadenMaisRecente="09:51"
    maiorChuvaUmaHora="0,2 mm"
    onRefresh={() => {}}
  /></div>;
}
