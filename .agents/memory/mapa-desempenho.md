---
name: Desempenho do mapa
description: Regra de renderização dos marcadores de ocorrências para dispositivos móveis.
---

O mapa deve manter os marcadores de ocorrências em uma camada imperativa do Leaflet, com os ícones individuais preservados; a inclusão inicial pode ser parcelada em pequenos lotes.

**Why:** Remover e recriar muitos marcadores durante gestos deixa a tela lenta em celulares e faz os ícones desaparecerem momentaneamente.

**How to apply:** Ao alterar filtros ou seleção, atualize apenas a camada afetada ou os ícones necessários. Evite estado React acionado por `movestart`, `zoomstart` ou eventos de alta frequência; não use contadores visuais sobre os marcadores sem solicitação.