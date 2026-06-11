---
name: Banco de horas — ocorrências automáticas
description: Regras e implementação das horas extras automáticas geradas por ocorrências na Escala.
---

## Regra de negócio
- Semana útil **noturno** (17h–7h): multiplicador `×(1 + percSobreaviso/100)` (normalmente ×1,5)
- **Sábado** qualquer horário: `×(1 + percSabado/100)` (normalmente ×1,5)
- **Domingo ou feriado** qualquer horário: `×(1 + percDomingoFeriado/100)` (normalmente ×2)
- Semana útil **diurno** (7h–17h): ignorado (sem banco automático)

**Why:** solicitação do Moisés — agentes que atenderam ocorrências fora do horário normal acumulam banco multiplicado automaticamente sem lançamento manual.

## Implementação
- Função `computarHorasOcorrencias(agente, ocorrencias, percSobreaviso, percSabado, percDomFer, feriadosCustom)` e helper `ehHorarioNoturno()` em `EscalaAgentes.tsx` (antes de `BancoHorasAgenteProps`).
- Interface `HoraOcorrenciaItem` com campos: `data`, `horasBase`, `multiplicador`, `horasComputadas`, `natureza`, `enderecoResumido`.
- Prop `ocorrencias?: Ocorrencia[]` adicionada a: `EscalaAgentesProps`, `BancoHorasAgenteProps`, `BancoHorasMoisesProps`.
- `App.tsx` passa `ocorrencias={ocorrencias}` para `<EscalaAgentes>`.
- `BancoHorasMoises` usa `ocAutoMap` (useMemo) mapeando nome→HoraOcorrenciaItem[] e passa `ocorrenciasItens` para `ModalDetalhesBanco`.
- CSS: classes `.bh-bloco-ocauto`, `.bh-oc-auto-row`, `.bh-oc-auto-info`, `.bh-oc-auto-calc`, `.bh-oc-auto-hora`, `.bh-oc-auto-nat`, `.bh-oc-auto-end`, `.bh-oc-auto-mult` em `EscalaAgentes.css`.

**How to apply:** ao mexer em BancoHorasAgente ou BancoHorasMoises, sempre checar se `ocorrencias` está sendo propagado corretamente como prop.
