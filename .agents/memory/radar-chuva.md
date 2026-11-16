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
Para reproduzir a evolução observada da chuva, usar apenas `radar.past`, trocando os tiles por quadro no cliente e oferecendo pausa/controle manual. Não misturar `radar.nowcast` na linha do tempo histórica; só usar o quadro mais recente de nowcast como reserva quando não houver observações.

**Why:** Misturar quadros futuros com os observados faz um controle de histórico apresentar previsão como se fosse medição; mostrar apenas o último quadro observado também esconde o deslocamento das células.

**How to apply:** Reiniciar a sequência ao atualizar os metadados, exibir o horário do quadro e manter a grade Open-Meteo como complemento quando houver poucos pixels de radar no município. Normalize `time` e `frameTime` ao consumir quadros.

**Why:** O endpoint local envia `frameTime`, enquanto componentes de tile podem esperar `time`; uma lista não vazia com nomes diferentes elimina todos os quadros válidos e impede até o fallback.

## Nuvens GOES e controle da precipitação
Mantenha as fontes meteorológicas em camadas independentes: “Nuvens GOES” mostra nuvens de satélite; “Chuva” mostra os ecos observados do RainViewer; “Radar sintético” pode mostrar o raster de estimativa de precipitação CEMADEN/GOES. A estimativa não é medição de pluviômetro nem deve ser apresentada como observação. No Radar DC, Chuva começa ativa; na aba Mapa, começa desligada e só mostra os ecos ao ativar o botão Chuva.

**Why:** O usuário pediu chuva observada separada da imagem de nuvens e rejeitou círculos de precipitação estimada; depois pediu explicitamente uma camada raster sintética, sem confundi-la com a observação.

**How to apply:** Preserve RainViewer como camada da chuva observada e CEMADEN/GOES como controle independente; mantenha os controles de cada mapa separados e não associe temperatura à ativação da chuva na aba Mapa. Use `/api/goes-nuvens` como reserva se os tiles NOAA falharem, atribua NOAA, RainViewer e CEMADEN e nunca trate nuvens ou estimativas como medição de precipitação.