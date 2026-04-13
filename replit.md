# Defesa Civil de Ouro Branco — Sistema de Vistorias

## Visão Geral
Sistema web completo de registro e gerenciamento de ocorrências para a Defesa Civil de Ouro Branco (MG).

## Arquitetura
- **Frontend**: React 19 + TypeScript + Vite (porta 5000 em desenvolvimento)
- **Backend**: Express.js API REST (porta 3001 em desenvolvimento, PORT env em produção)
- **Banco de Dados**: Replit PostgreSQL (DATABASE_URL)
- **Mapa**: React-Leaflet com OpenStreetMap
- **Exportação**: KMZ via JSZip, Excel via ExcelJS

## Estrutura
```
/
├── server/
│   └── index.js          # API Express + serve frontend em produção
├── src/
│   ├── App.tsx            # App principal — lista + mapa
│   ├── App.css            # Estilos — tema azul/laranja Defesa Civil
│   ├── types.ts           # Tipos TypeScript + constantes (naturezas, ícones, cores)
│   ├── api.ts             # Funções de fetch para a API
│   ├── exportExcel.ts     # Exportação Excel
│   ├── offline.ts         # Suporte offline / Service Worker
│   └── components/
│       ├── NovaOcorrencia.tsx     # Formulário completo de registro
│       ├── MapaOcorrencias.tsx    # Mapa Leaflet com marcadores coloridos
│       └── DetalheOcorrencia.tsx  # Modal de detalhe + exportar KMZ individual
├── public/
│   └── sw.js              # Service Worker
├── vite.config.ts         # Proxy /api → localhost:3001, host 0.0.0.0, porta 5000
└── package.json
```

## Workflows
- **Start application**: `node server/index.js & npm run dev` → porta 5000 (webview)

## Deployment
- Build: `npm run build` (gera dist/)
- Run: `node server/index.js` (serve API + frontend estático da dist/)
- Target: autoscale

## Banco de Dados — Tabela `ocorrencias`
| Campo | Tipo | Descrição |
|---|---|---|
| id | SERIAL | Chave primária |
| tipo | VARCHAR(255) | Vistoria, Diligência, Apoio, Outro |
| natureza | VARCHAR(255) | Tipo de natureza (Árvore, Incêndio, etc.) |
| subnatureza | VARCHAR(255) | Detalhe condicional (estrutura ou animal) |
| nivel_risco | VARCHAR(100) | baixo, medio, alto |
| status_oc | VARCHAR(100) | ativo, resolvido |
| fotos | JSONB | Array de base64 |
| lat | DOUBLE PRECISION | Latitude GPS |
| lng | DOUBLE PRECISION | Longitude GPS |
| endereco | TEXT | Endereço manual |
| proprietario | VARCHAR(255) | Nome do proprietário/morador |
| observacoes | TEXT | Texto livre |
| data_ocorrencia | TIMESTAMP | Data da ocorrência |
| created_at | TIMESTAMP | Data/hora automática |

## Funcionalidades
- Formulário com campos (tipo → natureza → subnatureza condicional → nível → status → fotos → GPS/endereço → proprietário → observações → data)
- Mapa OpenStreetMap centrado em Ouro Branco com marcadores por tipo (emoji + cor)
- Popup no marcador com botão "Ver detalhes"
- Modal de detalhe com exportação KMZ individual
- Exportação KMZ global de todas as ocorrências com GPS
- Exportação Excel de todas as ocorrências
- Filtros por nível, status e busca de texto
- Resumo numérico no topo (Alto, Médio, Baixo, Total)
- Suporte offline via Service Worker
