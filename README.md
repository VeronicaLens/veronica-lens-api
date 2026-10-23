# Veronica Lens API

API do Veronica Lens em Express 5 e TypeScript, com autenticacao via Supabase,
logs estruturados e documentacao HTTP interativa.

O projeto esta sendo reconstruido incrementalmente. Atualmente implementa
cadastro, login, renovacao de sessao e consulta do usuario autenticado.
Logout, recuperacao de senha e os demais dominios ainda nao estao implementados.

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

| Variavel | Obrigatoria | Padrao | Descricao |
| --- | --- | --- | --- |
| `NODE_ENV` | Nao | `development` | `development`, `test` ou `production` |
| `PORT` | Nao | `3000` | Inteiro de 1 a 65535 |
| `SUPABASE_URL` | Sim | Nenhum | URL HTTP ou HTTPS do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Sim | Nenhum | Chave publica usada pelos clientes de autenticacao e usuario |
| `SUPABASE_SECRET_KEY` | Nao | Nenhum | Chave exclusiva de futuras operacoes administrativas |

A configuracao e validada antes de abrir a porta. Erros indicam os campos
invalidos sem imprimir seus valores. A criacao do cliente nao verifica
conectividade com Supabase.

Os fluxos atuais de autenticacao nao precisam da chave administrativa.
Em producao, configure as variaveis no servico de hospedagem.
GitHub Actions secrets so sao necessarios quando o workflow acessa recursos
que exigem essas credenciais; os testes atuais nao precisam delas.

## Scripts

| Comando | Funcao |
| --- | --- |
| `npm run dev` | Executa a API com recarga automatica |
| `npm run typecheck` | Verifica tipos da aplicacao e dos testes |
| `npm test` | Executa todos os testes uma vez |
| `npm run test:watch` | Executa os testes em modo de observacao |
| `npm run build` | Compila a aplicacao para `dist/` |
| `npm start` | Executa a aplicacao compilada |

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

Cadastro, login e refresh compartilham 20 requisicoes por IP a cada 15 minutos,
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

## Antes de disponibilizar publicamente

- Usar HTTPS.
- Configurar confirmacao de email e URLs permitidas no Supabase.
- Revisar a confianca em proxies e os limites de trafego.
- Manter chaves administrativas somente no backend.
- Verificar grants e RLS antes de adicionar persistencia de dados.
- Validar os fluxos reais em ambiente separado de producao.
- Decidir se a documentacao interativa deve ser publica ou protegida.
