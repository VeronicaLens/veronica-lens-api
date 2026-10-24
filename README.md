# Veronica Lens API

API do Veronica Lens em Express 5 e TypeScript, com autenticacao via Supabase,
logs estruturados e documentacao HTTP interativa.

O projeto esta sendo reconstruido incrementalmente. Atualmente implementa
cadastro, login, renovacao de sessao, consulta do usuario autenticado, logout
da sessao atual, solicitacao de recuperacao de senha por email e atualizacao
da senha com a sessao do proprio usuario.
O recebimento do link no mobile e os demais dominios ainda nao estao
implementados.

## Requisitos

- Node.js compativel com os campos `engines` das dependencias instaladas.
  Para desenvolvimento e CI, prefira Node.js 24 LTS.
- npm.
- Projeto Supabase para executar os fluxos reais de autenticacao.

Os testes atuais nao exigem conta Supabase, credenciais reais ou banco local.

## Configuracao local

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Copie o exemplo somente se o arquivo `.env` ainda nao existir. Preencha os valores
reais antes de iniciar o servidor. Nunca versione o arquivo local ou credenciais.

### Variaveis de ambiente


| Variavel                   | Obrigatoria | Padrao        | Descricao                                                    |
| ---------------------------- | ------------- | --------------- | -------------------------------------------------------------- |
| `NODE_ENV`                 | Nao         | `development` | `development`, `test` ou `production`                        |
| `PORT`                     | Nao         | `3000`        | Inteiro de 1 a 65535                                         |
| `SUPABASE_URL`             | Sim         | Nenhum        | URL HTTP ou HTTPS do projeto Supabase                        |
| `SUPABASE_PUBLISHABLE_KEY` | Sim         | Nenhum        | Chave publica usada pelos clientes de autenticacao e usuario |
| `SUPABASE_SECRET_KEY`      | Nao         | Nenhum        | Chave exclusiva de futuras operacoes administrativas         |
| `PASSWORD_RESET_REDIRECT_URL` | Sim      | Nenhum        | Destino autorizado: `veronicalens://auth/reset-password`     |
| `CORS_ORIGINS`             | Nao         | Vazio         | Origens de navegador permitidas, separadas por virgula       |

A configuracao e validada antes de abrir a porta. Erros indicam os campos
invalidos sem imprimir seus valores. A criacao do cliente nao verifica
conectividade com Supabase.

Os fluxos atuais de autenticacao nao precisam da chave administrativa.
Em producao, configure as variaveis no servico de hospedagem.
GitHub Actions secrets so sao necessarios quando o workflow acessa recursos
que exigem essas credenciais; os testes atuais nao precisam delas.

## Scripts


| Comando              | Funcao                                   |
| ---------------------- | ------------------------------------------ |
| `npm run dev`        | Executa a API com recarga automatica     |
| `npm run typecheck`  | Verifica tipos da aplicacao e dos testes |
| `npm test`           | Executa todos os testes uma vez          |
| `npm run test:watch` | Executa os testes em modo de observacao  |
| `npm run build`      | Compila a aplicacao para `dist/`         |
| `npm start`          | Executa a aplicacao compilada            |

Para validar e executar a versao compilada:

```powershell
npm run typecheck
npm test
npm run build
npm start
```

## Documentacao HTTP

Com a API rodando na porta padrao:

- [Swagger UI](http://localhost:3000/docs/): interface interativa.
- [OpenAPI JSON](http://localhost:3000/openapi.json): contrato importavel em
  ferramentas como Postman.
- [Health check](http://localhost:3000/health): verifica o processo da API,
  sem consultar Supabase.

Ajuste host e porta de acordo com o ambiente. Na API hospedada, os caminhos
`/docs/` e `/openapi.json` permanecem os mesmos.

O contrato e mantido em [src/docs/openapi.ts](./src/docs/openapi.ts).
Ao alterar um endpoint, atualize o contrato e os testes no mesmo commit.
Swagger UI apresenta a especificacao; nao a gera automaticamente a partir
dos controllers.

Para testar `/api/v1/auth/me`, use **Authorize** e informe somente o access token,
sem o prefixo `Bearer`. A autorizacao nao e persistida no armazenamento do
navegador pela configuracao da interface.

As operacoes executadas no Swagger sao reais: podem criar contas e enviar
emails. Use um projeto de desenvolvimento e nao compartilhe tokens,
capturas de tela ou respostas contendo sessoes.

## Arquitetura

Monolito modular com separacao por funcionalidade:

```text
src/
  app.ts                 # Composicao do Express, sem abrir porta
  server.ts              # Ambiente, dependencias reais e inicializacao
  config/                # Validacao de ambiente e clientes Supabase
  docs/                  # Contrato OpenAPI e Swagger UI
  modules/
    auth/                # Schemas, rotas, controller, service e model
  shared/
    auth/                # Middleware e contexto autenticado
    errors/              # Erros da aplicacao
    http/                # Parser, logs HTTP e tratamento de erros
    logging/             # Logger compartilhado
tests/
  auth/                  # Testes do modulo de autenticacao
```

Fluxo principal:

```text
Route -> Controller/Schema -> Service -> Model -> Supabase
```

- Controllers traduzem entrada e saida HTTP.
- Services aplicam regras e selecionam os campos publicos.
- Models encapsulam chamadas ao provedor.
- A aplicacao recebe o model por injecao de dependencia.
- Cada operacao de autenticacao cria um cliente sem persistir sessao no servidor.
- Clientes de usuario usam o JWT da requisicao; consultas de dados dependem
  tambem de grants e RLS no Supabase.
- Clientes administrativos podem ignorar RLS e nao devem substituir o acesso
  contextualizado do usuario.

## Autenticacao e sessoes

O cadastro pode retornar sessao imediata ou exigir confirmacao de email,
conforme a configuracao do Supabase. A resposta nao comprova que o email
estava disponivel antes da solicitacao.

A rota protegida valida o access token consultando Supabase Auth; decodificar
um JWT localmente nao e suficiente para estabelecer a identidade.

Na renovacao, o aplicativo deve substituir ambos os tokens pelos valores
retornados e evitar renovacoes concorrentes da mesma sessao.
Uma falha de rede ou indisponibilidade do provedor nao comprova revogacao.

Os contratos completos de entrada, resposta e status HTTP estao no Swagger.
Nao envie objetos completos do SDK ao aplicativo nem use metadados editaveis
pelo usuario para atribuir privilegios administrativos.

O logout encerra somente a sessao atual no provedor. Outras sessoes
permanecem ativas. Access tokens emitidos podem continuar validos ate
expirar; o aplicativo deve remover os tokens locais ao sair.

Se a revogacao remota falhar, a API retorna erro. Apagar os tokens locais
nao comprova que a sessao foi revogada no provedor.

### Recuperacao de senha

A solicitacao retorna HTTP 202 com mensagem generica, sem confirmar se existe
uma conta. Falhas do provedor e limites de envio continuam retornando erro.
A resposta nao comprova a entrega do email.

Configure `PASSWORD_RESET_REDIRECT_URL=veronicalens://auth/reset-password`
e autorize exatamente esse endereco no painel Supabase em
**Authentication -> URL Configuration -> Redirect URLs**, sem curingas amplos.
O destino vem da configuracao da API, nunca do corpo da requisicao.

O fluxo completo ainda esta pendente no mobile: o app precisa registrar o scheme
`veronicalens` em sua configuracao nativa, receber o retorno do link e chamar
a atualizacao de senha. Alterar o scheme exige gerar uma nova development build.
Os testes locais usam mocks e nao verificam entrega de email nem abertura do app.

### Atualizacao de senha

`PUT /api/v1/auth/password` exige o access token no header `Authorization`
e recebe a nova senha e o refresh token da mesma sessao. A API cria um cliente
Supabase exclusivo da requisicao, estabelece a sessao do usuario e chama
`updateUser`; a chave administrativa nao e usada. As regras do Supabase,
como a recusa da mesma senha e a exigencia de reautenticacao recente quando
habilitada, continuam valendo.

O SDK renovaria automaticamente sessoes perto de expirar, rotacionando os
tokens no servidor sem que o app recebesse os novos. Por isso a API recusa,
com `AUTH_SESSION_REFRESH_REQUIRED`, sessoes com menos de 2 minutos de
validade ou que nao correspondam ao usuario autenticado. Nesse caso, o app deve
renovar a sessao e repetir a operacao.

A resposta retorna somente o usuario publico. Confira no painel Supabase se
outras sessoes sao encerradas apos a troca; a API nao revoga sessoes por conta
propria nesta etapa.

## Headers de seguranca e CORS

`helmet` adiciona headers de seguranca a todas as respostas, inclusive erros
e 404, como `Content-Security-Policy`, `X-Content-Type-Options` e
`X-Frame-Options`. A CSP padrao funciona com o Swagger UI servido pela API.

Com `NODE_ENV=production`, a API tambem envia HSTS e a diretiva
`upgrade-insecure-requests`. Fora de producao essas duas protecoes ficam
desligadas, para permitir abrir `/docs/` por HTTP pelo IP da rede local.
Em producao, sirva a API somente por HTTPS.

CORS fica fechado por padrao. O app mobile nao depende de CORS, que e uma
protecao de navegadores, e o Swagger UI usa a mesma origem da API.
Para liberar um cliente web, informe as origens exatas em `CORS_ORIGINS`,
por exemplo `https://admin.example.com,http://localhost:8081`.
Curingas, caminhos e barra final sao rejeitados na inicializacao.

As respostas CORS aceitam somente os headers `Authorization` e `Content-Type`,
expoem `X-Request-Id`, `Retry-After`, `RateLimit` e `RateLimit-Policy`, e
nunca permitem cookies entre origens.

## Erros e logs

Os erros usam o envelope:

```json
{
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "Route not found"
  }
}
```

O middleware central trata erros esperados, JSON invalido, limite do corpo
de 1 MB e falhas inesperadas. Stack traces e mensagens internas do provedor
nao sao retornados ao cliente.

Logs sao escritos em JSON com Pino. Cada requisicao recebe um identificador
gerado pelo servidor, retornado no header `X-Request-Id`.
Headers, corpos, URLs completas e mensagens de erros externos nao sao
registrados automaticamente.

Nunca registre tokens, senhas, chaves ou o contexto autenticado completo.

## Limite de tentativas

Cadastro, login, refresh, recuperacao e atualizacao de senha compartilham
20 requisicoes por IP a cada 15 minutos,
contando sucessos e falhas. O bloqueio retorna HTTP 429 e `Retry-After`.
A consulta do usuario autenticado nao usa esse limitador.

O contador atual fica em memoria: reinicia com o processo e nao e compartilhado
entre instancias. Usuarios na mesma rede podem compartilhar o limite.
Antes de escalar, use um armazenamento compartilhado.

O parser JSON roda antes do limitador das rotas: corpos malformados ou acima
do limite sao rejeitados antes dessa contagem.

Antes do deploy, configure `trust proxy` conforme a topologia da hospedagem.
Nao habilite `trust proxy=true` indiscriminadamente. Essa protecao nao substitui
limites na borda nem os controles do Supabase.

## Testes

Vitest executa os testes; Supertest exercita a aplicacao HTTP sem iniciar
manualmente o servidor.

```powershell
npm test -- tests/auth
npm test -- tests/docs.test.ts
```

A suite cobre configuracao, schemas, model, service, rotas, renovacao,
autenticacao bearer, limite de tentativas e entrega da documentacao.

Os testes usam dependencias simuladas. Nao comprovam entrega de emails,
rotacao real de tokens, conectividade, grants ou RLS.
Os testes da documentacao tambem nao substituem validacao de todas as respostas
reais contra o contrato OpenAPI.

Os testes nao precisam de `.env` nem de credenciais do Supabase.
Migrations e testes de banco (RLS, grants) ficam no repositorio
`veronica-lens-database`.

## CI/CD

- `.github/workflows/ci.yml`: em pushes para `dev` e pull requests para `dev`,
  `qual` e `main`, executa `npm ci`, `typecheck`, `test` e `build`.
- `.github/workflows/deploy.yml`: em pushes para `qual` e `main`, reaproveita a
  CI e, se ela passar, aciona o deploy hook do Render do ambiente
  correspondente (`qa` ou `production`).

O deploy usa o secret `RENDER_DEPLOY_HOOK_URL` e a variable `RENDER_SERVICE_URL`
de cada GitHub Environment. As variaveis de ambiente da API ficam no Render.

## Antes de disponibilizar publicamente

- Usar HTTPS.
- Configurar confirmacao de email e URLs permitidas no Supabase.
- Revisar a confianca em proxies e os limites de trafego.
- Manter chaves administrativas somente no backend.
- Verificar grants e RLS antes de adicionar persistencia de dados.
- Validar os fluxos reais em ambiente separado de producao.
- Decidir se a documentacao interativa deve ser publica ou protegida.
