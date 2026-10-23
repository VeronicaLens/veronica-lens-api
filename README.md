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

## Testes

Execute todos os testes:

    npm test

Execute em modo de observacao:

    npm run test:watch

Os testes atuais verificam configuracao de ambiente e comportamento HTTP.
Eles nao precisam de servidor iniciado manualmente nem acessam Supabase.

A verificacao de tipos inclui os testes:

    npm run typecheck

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

## Autenticacao em implementacao

Rotas planejadas, ainda nao disponiveis:

- POST /api/v1/auth/sign-up
- POST /api/v1/auth/sign-in

Corpo de cadastro:

```json
{
  "email": "user@example.com",
  "password": "example-password",
  "displayName": "Veronica"
}
```

displayName e opcional. O cadastro aceita senhas de 8 a 72 caracteres.

O login recebe email e password. Aceita senha nao vazia de ate 72 caracteres.
Senhas nao sao aparadas nem normalizadas.

Entradas invalidas retornarao HTTP 400 com o codigo VALIDATION_ERROR.
Campos nao declarados nos schemas sao descartados.

### Model de autenticacao

O SupabaseAuthModel implementa cadastro e login usando um cliente de
autenticacao criado por operacao.

O model nao usa credenciais administrativas, nao define status HTTP e
nao transforma erros do provedor em respostas publicas.

Os testes dessa camada simulam o SDK e nao validam conectividade real.
Os endpoints permanecem indisponiveis ate a implementacao do service
e do controller.

### Service de autenticacao

O AuthService seleciona os campos publicos de usuario e sessao.
Objetos completos do SDK nao sao retornados ao aplicativo.

O cadastro pode retornar sessao imediata ou exigir confirmacao de email.
A resposta nao deve ser interpretada como prova de que um email ainda
nao estava cadastrado.

Erros conhecidos sao convertidos em codigos publicos. Mensagens internas
do Supabase nao sao expostas.

Os endpoints ainda nao estao conectados.

## Endpoints de autenticacao

### POST /api/v1/auth/sign-up

Recebe email, password e displayName opcional.

- 201: cadastro com sessao imediata.
- 202: solicitacao aceita, sem sessao; confirmacao necessaria.

A resposta usa o envelope data, contendo user, session e
confirmationRequired. Ela nao comprova que o email nao estava cadastrado.

### POST /api/v1/auth/sign-in

Recebe email e password.

- 200: sessao autenticada.
- 401: credenciais invalidas.
- 403: email ainda nao confirmado.

A resposta usa o envelope data com user, accessToken, refreshToken,
tokenType e expiresAt.

Ambas as rotas podem retornar erros de validacao, limite de tentativas
ou indisponibilidade do provedor. Mensagens internas nao sao expostas.

Os testes HTTP simulam o model; nao verificam Supabase real.

## Limite de tentativas de autenticacao

Cadastro e login compartilham um limite de 20 requisicoes por IP
a cada 15 minutos. Sucessos e falhas entram na contagem.

Quando o limite e atingido, a API retorna HTTP 429 com o codigo
AUTH_RATE_LIMITED e o header Retry-After.

O armazenamento atual e em memoria:

- os contadores sao reiniciados junto com o processo;
- instancias diferentes nao compartilham contadores;
- usuarios na mesma rede podem compartilhar o limite.

Antes de escalar para varias instancias, configure um armazenamento
compartilhado, como Redis.

Em hospedagem atras de proxy, configure trust proxy de acordo com
a topologia documentada pelo provedor. Nao use trust proxy=true
indiscriminadamente.

### POST /api/v1/auth/refresh

Recebe:

```json
{
  "refreshToken": "refresh-token-da-sessao"
}
```

Retorna HTTP 200 com o mesmo contrato publico da sessao de login.

O aplicativo deve substituir o accessToken e o refreshToken armazenados
pelos valores retornados. Nao deve executar renovacoes concorrentes da
mesma sessao: use uma unica renovacao em andamento e compartilhe o
resultado entre as requisicoes que aguardam.

- 400: entrada invalida.
- 401 / AUTH_SESSION_INVALID: sessao invalida ou expirada.
- 429: limite de tentativas.
- 503: provedor temporariamente indisponivel.

Cadastro, login e refresh compartilham o limite de autenticacao.

Em caso de 401 de sessao invalida, o app deve encerrar a sessao local.
Falhas de rede ou indisponibilidade nao devem ser tratadas como prova
de que a sessao foi revogada.

Tokens nunca devem ser registrados em logs.
