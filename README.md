# Veronica Lens API

API em Express 5 e TypeScript.

## Configuracao local

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Copie o exemplo apenas se o arquivo de ambiente local ainda nao existir.
Nunca versione arquivos locais com credenciais.

## Variaveis de ambiente


| Variavel | Padrao      | Valores aceitos                 |
| ---------- | ------------- | --------------------------------- |
| NODE_ENV | development | development, test ou production |
| PORT     | 3000        | Numero inteiro entre 1 e 65535  |

A API interrompe a inicializacao quando uma configuracao e invalida.
Em producao, configure as variaveis no servico de hospedagem.

## Validacao e execucao

```powershell
npm run typecheck
npm run build
npm start
```

Health check: `GET /health`.

## Erros HTTP

As respostas de erro seguem este formato:

```json
{
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "Route not found"
  }
}
```

- 400 / INVALID_JSON: corpo JSON invalido.
- 404 / ROUTE_NOT_FOUND: rota inexistente.
- 413 / PAYLOAD_TOO_LARGE: corpo acima do limite de 1 MB.
- 500 / INTERNAL_SERVER_ERROR: falha inesperada.

Detalhes internos e stack traces nao sao enviados nas respostas.

## Logs

A API escreve logs estruturados em JSON na saida padrao.

Cada requisicao recebe um identificador gerado pelo servidor, retornado no
header X-Request-Id. Esse identificador permite correlacionar os logs da
requisicao.

Headers, corpos, URLs completas e mensagens de erros externos nao sao
registrados automaticamente.

## Supabase

Variaveis obrigatorias:

- SUPABASE_URL: URL do projeto.
- SUPABASE_PUBLISHABLE_KEY: chave publica do projeto.

Variavel opcional:

- SUPABASE_SECRET_KEY: chave exclusiva de operacoes administrativas.

Os clientes de usuario usam o JWT da requisicao e dependem de RLS no banco.
Clientes administrativos nao devem ser usados em operacoes comuns de usuario.

A criacao de um cliente nao verifica conectividade nem valida a identidade
do usuario. Essas verificacoes sao feitas pelos fluxos que utilizam o cliente.

Nunca versione credenciais ou registre tokens nos logs.
