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

## Animação do radar
Para reproduzir a evolução das áreas de chuva, usar a sequência `radar.past` e `radar.nowcast` da API pública, trocando os tiles por quadro no cliente e oferecendo pausa/controle manual.

**Why:** O endpoint entrega metadados de vários quadros, mas usar apenas o último quadro faz a chuva parecer desaparecer e não mostra o deslocamento das células.

**How to apply:** Reiniciar a sequência ao atualizar os metadados, exibir horário e tipo de cada quadro, e manter a grade Open-Meteo como complemento quando houver poucos pixels de radar no município. Normalize `time` e `frameTime` ao consumir quadros e use o quadro mais recente como reserva.

**Why:** O endpoint local envia `frameTime`, enquanto componentes de tile podem esperar `time`; uma lista não vazia com nomes diferentes elimina todos os quadros válidos e impede até o fallback.

## Nuvens GOES e controle da precipitação
Mantenha GOES e RainViewer como camadas independentes: “Nuvens GOES” mostra apenas nuvens de satélite; “Chuva” mostra os ecos de precipitação observada. No Radar DC, RainViewer começa ativo e GOES desligado; na aba Mapa, ambos começam desligados.

**Why:** O usuário pediu controles separados para distinguir nuvens observadas por satélite da precipitação real do radar.

**How to apply:** Preserve os estados iniciais distintos entre as telas, use `/api/goes-nuvens` como reserva se os tiles NOAA falharem, atribua NOAA e RainViewer e não trate a imagem GOES como medição de precipitação.