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

**How to apply:** Reiniciar a sequência ao atualizar os metadados, exibir horário e tipo de cada quadro, e manter a grade Open-Meteo como complemento quando houver poucos pixels de radar no município.

## Nuvens GOES e estado inicial por mapa
Use a camada pública NOAA GOES ImageServer em tiles para mostrar nuvens no mapa, com RainViewer por cima para a precipitação observada. No Mapa, as duas camadas começam desligadas e aparecem juntas ao clicar em “Chuva”; no Radar DC, a chuva começa ativa.

**Why:** O usuário pediu que o mapa operacional só mostre nuvens ao ativar “Chuva”, mantendo o Radar DC com chuva ativa; os tiles NOAA seguem a fonte e o padrão do código de referência.

**How to apply:** Preserve o estado inicial distinto entre as telas, atribua NOAA e RainViewer e não trate a imagem GOES como medição de precipitação.