# Caos Backend

Backend em Node.js + Express para catalogo de demonstracao, checkout com calculo de valores no servidor, controle de pedidos com expiracao, polling e webhook de pagamento.

## Estrutura do Projeto

- `index.js` — Servidor Express, catalogo de demonstracao, rotas da API, rate limiting, webhook e healthcheck
- `package.json` — Dependencias e script `npm start`
- `.gitignore` — Exclusao de `node_modules/`, `.env` e arquivos temporarios
- `README.md` — Documentacao local e configuracao para deploy no Render

## Requisitos

- Node.js `>= 20.0.0`
- npm

## Execucao Local

```bash
npm install
npm start
```

Para validar sintaxe antes de iniciar:

```bash
node --check index.js
```

## Variaveis de Ambiente

Nenhuma chave privada deve ser armazenada no codigo ou enviada ao GitHub. Configure estas variaveis no ambiente local (`.env`) ou no painel do Render:

| Variavel | Obrigatoria | Padrao | Descricao |
| --- | --- | --- | --- |
| `PORT` | Nao (Render injeta automaticamente) | `3000` | Porta HTTP do servidor |
| `ATENASPAY_API_KEY` | Sim (para checkout e polling) | — | Chave de autenticacao do provedor de pagamento |
| `ATENASPAY_API_BASE` | Nao | `https://atenaspay.com.br` | URL base da API do provedor |
| `CORS_ORIGIN` | Nao | `*` (qualquer origem) | Origens permitidas separadas por virgula |
| `CARD_SEED` | Nao | `20261110` | Semente deterministica do catalogo de demonstracao |
| `STOCK_SIZE` | Nao | `240` | Quantidade de itens gerados no catalogo de demonstracao |
| `REF_CODE_LENGTH` | Nao | `6` | Tamanho dos codigos de referencia/rastreio ficticios (ex.: `3`, `6`, `12`; minimo `3`, maximo `32`) |

## Endpoints Principais

- `GET /health` — Status do servidor e quantidade de itens disponiveis
- `GET /api/catalog` — Lista publica dos itens de demonstracao disponiveis
- `POST /api/checkout` — Validacao de itens, calculo de valor no servidor e criacao de pedido
- `GET /api/order/:id` — Consulta status do pedido (`pendente`, `pago` ou `expirado`)
- `POST /api/webhook/atena` — Recebe notificacoes de confirmacao do provedor

## Configuracao no Render

- **Runtime:** Node
- **Branch:** `main`
- **Root Directory:** *(vazio)*
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment Variables:** configurar `ATENASPAY_API_KEY` e, se necessario, `CORS_ORIGIN`, `REF_CODE_LENGTH`, `STOCK_SIZE`, `CARD_SEED`
