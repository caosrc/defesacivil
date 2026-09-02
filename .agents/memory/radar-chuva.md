---
name: Radar de chuva
description: Decisão e limitações das fontes de precipitação usadas no mapa.
---

O mapa usa RainViewer para os quadros observados de radar meteorológico, com atribuição visível e cache de metadados no servidor. A API pode não ter SLA e deve ser tratada como fonte complementar.

**Why:** RainViewer é uma fonte pública sem chave que entrega tiles compatíveis com Leaflet; o produto GOES-16 RRQPE é NetCDF e não pode ser tratado como um tile pronto no navegador.

**How to apply:** Se for adicionada uma camada de nuvens GOES-16 ou RRQPE, criar um pequeno serviço de processamento geoespacial separado, gerar raster/tiles recortados para Ouro Branco e manter RainViewer como comparação/contingência.

## Histórico e cobertura complementar
O RainViewer é adequado para o quadro observado recente, mas não para confirmar chuva de ontem. Para histórico local e uma indicação de cobertura no entorno, consultar uma fonte horária como Open-Meteo separadamente.

**Why:** Os quadros públicos do RainViewer são limitados ao radar recente e podem não ter pixels sobre municípios pequenos; um quadro vazio não prova que não choveu.

**How to apply:** Exibir o horário do quadro observado, manter um resumo histórico separado e tratar a grade meteorológica ao redor como estimativa complementar, nunca como substituta silenciosa do radar.