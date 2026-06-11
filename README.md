# SmartPDV

**Sistema de Gestão de Vendas no PDV** — by Smartdata Consultoria

App mobile-first (PWA) para promotores de campo, com backend Supabase e dashboards Power BI.

---

## Estrutura do projeto

```
smartpdv/
├── index.html              # App completo (todas as telas)
├── manifest.json           # PWA manifest
├── supabase_schema.sql     # Schema completo do banco de dados
└── assets/
    ├── css/
    │   └── app.css         # Design system — tema claro
    ├── js/
    │   └── app.js          # Toda a lógica + integração Supabase
    └── icons/
        ├── icon-192.png    # Ícone PWA (adicionar manualmente)
        └── icon-512.png    # Ícone PWA (adicionar manualmente)
```

---

## Configuração rápida

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Abra o **SQL Editor** e execute `supabase_schema.sql`
3. Crie os buckets de Storage: `avarias` e `exposicao` (acesso público)
4. Copie a **URL** e a **anon key** do projeto (Settings → API)

### 2. Conectar o app

Abra `assets/js/app.js` e substitua nas primeiras linhas:

```js
const SUPA_URL  = 'https://uoijdemarffretkobdff.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // já configurado
```

### 3. Deploy (Vercel)

```bash
# Vincule este repositório ao Vercel
# Deploy automático a cada push na branch main
```

---

## Módulos

| Módulo | Tela | Tabela Supabase |
|--------|------|-----------------|
| Estoque Sistema vs Físico | `sc-estoque` | `estoque_lancamentos` |
| Checklist diário | `sc-checklist` | `checklists` |
| Avarias | `sc-avarias` | `avarias` |
| Preços de concorrentes | `sc-concorrentes` | `precos_concorrentes` |
| Desempenho / Meta | `sc-desempenho` | `desempenho` |
| Oportunidades | `sc-oportunidades` | `oportunidades` |
| Ranking / Pontuação | `sc-pontuacao` | `pontos_historico`, `pontos_ranking` |
| Configurações | `sc-config` | `lojas`, `produtos`, `similares_concorrentes` |

---

## Conexão Power BI (ODBC)

Use o **Session Pooler** do Supabase:

| Campo | Valor |
|-------|-------|
| Host | `aws-0-sa-east-1.pooler.supabase.com` |
| Porta | `5432` |
| Banco | `postgres` |
| Usuário | `postgres.uoijdemarffretkobdff` |
| Senha | senha do banco (Settings → Database) |

**Views recomendadas para Power BI:**
- `vw_acuracidade_estoque` — divergências por produto/PDV
- `vw_resumo_pdv` — KPIs diários por loja
- `vw_precos_concorrentes` — análise competitiva
- `pontos_ranking` — ranking de promotores

---

## Segurança (produção)

1. Migre o login para **Supabase Auth** (email/senha ou magic link)
2. Habilite **RLS** em todas as tabelas (ver comentários no SQL)
3. Remova o campo `senha` em texto puro da tabela `promotores`
4. Configure **políticas por empresa_id** para isolamento multi-tenant

---

## Stack

- **Frontend:** HTML + CSS + JS puro (sem framework) · PWA offline-ready
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Deploy:** Vercel (auto-deploy via GitHub)
- **Analytics:** Power BI via ODBC Session Pooler

---

*Smartdata Consultoria · smartdataconsult.com*
