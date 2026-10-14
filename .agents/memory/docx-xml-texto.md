---
name: Texto XML em relatórios DOCX
description: Como encontrar ou remover parágrafos do modelo de relatório Word pelo texto visível.
---

Ao manipular o OOXML dos relatórios, a frase visível de um parágrafo pode estar dividida entre vários elementos `<w:t>`. Comparar uma frase completa com o XML bruto falha nesse caso; concatene os textos de todos os elementos `<w:t>` do parágrafo antes de identificá-lo.

**Why:** Os geradores precisam substituir ou remover blocos do modelo, como as assinaturas, sem deixar conteúdo obsoleto.

**How to apply:** Ao selecionar parágrafos por texto, compare o texto visível agregado por parágrafo e confira o documento gerado para cada tipo de ocorrência afetado.
