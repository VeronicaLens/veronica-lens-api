# Veronica Lens API

API do Veronica Lens em Express 5 e TypeScript, com autenticacao via Supabase,
logs estruturados e documentacao HTTP interativa.

O projeto esta sendo reconstruido incrementalmente. Atualmente implementa
cadastro, login por senha e com Google, renovacao de sessao, consulta do
usuario autenticado, logout da sessao atual, solicitacao de recuperacao de
senha por email, atualizacao da senha com a sessao do proprio usuario,
consulta/edicao do proprio perfil, upload/remocao de avatar, exclusao da
propria conta e consulta ao catalogo de objetos celestes. Tambem estao
implementados eventos astronomicos, trilhas e licoes, historico de observacoes
com upload de fotos e registro de dispositivos para notificacoes push.
Os demais dominios (health e conectividade) ainda nao estao implementados.

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
| `SUPABASE_SECRET_KEY`      | Sim         | Nenhum        | Chave secreta, usada somente na exclusao de conta            |
| `PASSWORD_RESET_REDIRECT_URL` | Sim      | Nenhum        | Destino autorizado: `veronicalens://auth/reset-password`     |
| `CORS_ORIGINS`             | Nao         | Vazio         | Origens de navegador permitidas, separadas por virgula       |
| `NOTIFICATIONS_DISPATCH_SECRET` | Nao    | Nenhum        | Segredo do job de envio (minimo 32 caracteres). Sem ele, o envio fica desabilitado |

A configuracao e validada antes de abrir a porta. Erros indicam os campos
invalidos sem imprimir seus valores. A criacao do cliente nao verifica
conectividade com Supabase.

`SUPABASE_SECRET_KEY` e obrigatoria: a API nao inicia sem ela. A chave ignora
RLS e as policies de Storage; e usada apenas pelo modulo `account` e nunca deve
ser enviada ao app ou registrada em logs. Os demais fluxos usam a chave publica
e, quando ha usuario, o JWT dele.
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
    account/             # Exclusao da propria conta (chave secreta)
    astronomy/           # Calculos de posicao e cliente do JPL Horizons
    auth/                # Schemas, rotas, controller, service e model
    catalog/             # Catalogo estatico de objetos celestes
    conditions/          # Avaliacao das condicoes de observacao
    events/              # Eventos astronomicos curados (Supabase, RLS)
    learning/            # Trilhas e licoes publicadas, progresso por usuario
    notifications/       # Tokens Expo por dispositivo e envio de eventos
    planning/            # Recomendacao da melhor janela de observacao
    profile/             # Perfil do usuario autenticado
    sky-guide/           # Posicoes dos objetos do catalogo para o observador
    weather/             # Previsao horaria via Open-Meteo, com cache
  shared/
    auth/                # Middleware, contexto autenticado e requireAuth
    errors/              # Erros da aplicacao
    http/                # Parser, logs HTTP, seguranca e tratamento de erros
    logging/             # Logger compartilhado
tests/
  helpers/               # Mocks tipados compartilhados dos models
  account/               # Testes do modulo de conta
  astronomy/             # Calculos, cliente do Horizons e cache
  fixtures/              # Respostas reais de provedores externos
  auth/                  # Testes do modulo de autenticacao
  catalog/               # Testes do catalogo e da integridade dos dados
  conditions/            # Avaliacao, service e rotas de condicoes
  events/                # Eventos curados
  learning/              # Trilhas, licoes e progresso
  notifications/         # Registro de dispositivos, envio e cliente Expo
  planning/              # Recomendacao de janelas de observacao
  profile/               # Testes do modulo de perfil
  sky-guide/             # Testes do guia do ceu
  weather/               # Cliente do Open-Meteo e cache
```

Ao adicionar um metodo a um `ModelPort`, atualize o mock correspondente em
`tests/helpers/mocks.ts`. Ao adicionar uma dependencia ao `createApp`, inclua
seu mock em `createAppMocks()`; os testes usam
`createApp({ ...createAppMocks(), authModel })` e sobrescrevem so o que usam.

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

### Login com Google

`POST /api/v1/auth/google` recebe `{ "idToken": "...", "nonce": "..." }`. O app
obtem o ID token pelo Google Sign-In no aparelho; a API o troca por uma sessao
do Supabase com `signInWithIdToken` e devolve a mesma sessao publica do login
por senha. No primeiro acesso, o Supabase cria a conta.

- A assinatura, o emissor, a audiencia e a validade do token sao verificados
  pelo Supabase; a API so valida o formato antes de enviar.
- `nonce` e opcional. Se o token foi solicitado com nonce, envie o valor
  original; o Supabase compara com o hash presente no token. Usar nonce
  protege contra reuso de um ID token capturado.
- Token invalido, expirado, de outro app ou com nonce divergente retorna
  `401 AUTH_GOOGLE_TOKEN_INVALID`. Provedor desabilitado no Supabase retorna
  `503` e e registrado em log.
- A rota compartilha o limite de tentativas de autenticacao.

Configuracao necessaria no painel do Supabase, em
**Authentication -> Sign In / Providers -> Google**: habilitar o provedor e
cadastrar em **Client IDs** os IDs OAuth do Google usados pelo app (Web e
Android). Sem isso, todo login com Google falha.

O nome publico usa `display_name` dos metadados e, para contas Google,
`full_name` ou `name`. A trigger do banco que cria `profiles` ainda le apenas
`display_name`; ate uma migration no `veronica-lens-database` ajustar isso,
perfis criados pelo Google comecam com `displayName` nulo.

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

## Perfil

`GET /api/v1/profile` e `PATCH /api/v1/profile` exigem bearer token. A API
consulta a tabela `profiles` com um cliente Supabase criado com o JWT do
usuario, sem a chave administrativa; as policies de RLS do banco limitam o
acesso ao proprio perfil. O schema e as policies ficam em
`veronica-lens-database`.

O `PATCH` aceita somente os campos enviados e rejeita campos desconhecidos.
Latitude e longitude vao juntas, ambas numeros ou ambas `null`, como exige a
constraint do banco. O avatar nao e editavel por essa rota, para impedir URLs
externas arbitrarias.

### Avatar

`PUT /api/v1/profile/avatar` recebe os bytes da imagem no corpo, com
`Content-Type` `image/jpeg`, `image/png` ou `image/webp`, ate 5 MB (o limite do
bucket `avatars`). A API confere a assinatura real do arquivo contra o tipo
declarado; um SVG ou HTML enviado como `image/png` e rejeitado.

O arquivo fica em `avatars/<user_id>/avatar` e e sobrescrito a cada envio.
O upload usa o JWT do usuario; as policies de Storage so permitem escrita na
pasta do proprio usuario. A URL publica gravada no perfil recebe `?v=<timestamp>`
para invalidar caches. O bucket e de leitura publica: nao envie imagens que
nao devam ser publicas.

`DELETE /api/v1/profile/avatar` remove o arquivo, inclusive os nomes antigos
`avatar.jpg|png|webp` da API anterior, e limpa `avatarUrl`. Se o Storage falhar,
o perfil nao e alterado. Se o perfil falhar depois do upload, o arquivo novo
ja estara gravado e um novo envio corrige a URL.

O app deve enviar imagens ja redimensionadas; a API nao processa nem
redimensiona imagens.

O perfil e criado por trigger no cadastro. Se nao for encontrado ou nao estiver
visivel para o usuario, a API retorna `404 PROFILE_NOT_FOUND`.
Os testes usam mocks e nao verificam as policies de RLS; essa verificacao fica
nos testes pgTAP do repositorio do banco.

## Catalogo de objetos celestes

`GET /api/v1/catalog/celestial-objects` lista e busca objetos; `GET
/api/v1/catalog/celestial-objects/{id}` retorna um objeto. As duas rotas
exigem bearer token.

- Parametros de busca: `q` (1 a 80 caracteres), `type` (`moon`, `planet`,
  `star`, `constellation`) e `limit` (1 a 50, padrao 20). Parametros
  desconhecidos ou repetidos retornam `400`.
- A busca ignora maiusculas e acentos e compara id, nome e apelidos:
  `orion` encontra `Órion`.
- IDs inexistentes ou malformados retornam `404 CELESTIAL_OBJECT_NOT_FOUND`.

O catalogo e estatico, em `src/modules/catalog/catalog.data.ts`, com 24 objetos:

- Lua e planetas usam coordenadas `ephemeris`, com o ID do objeto no JPL
  Horizons; a posicao depende da data e sera calculada pelos proximos modulos.
- Estrelas e constelacoes usam coordenadas `fixed` J2000 em graus. As
  coordenadas de constelacoes sao centros aproximados, apenas para orientacao.

Alteracoes no catalogo mudam a API publica; os testes validam IDs unicos e
faixas de coordenadas. O model devolve copias, entao nenhuma requisicao altera
os dados em memoria.

## Astronomia e JPL Horizons

O modulo `astronomy` calcula posicoes no ceu e nao tem rotas proprias; e usado
pelo guia do ceu (posicoes e nascer/por) e pelo planejamento.

- **Estrelas e constelacoes** (coordenadas fixas J2000): conversao local de
  equatorial para horizontal (`astro-core.ts`), sem chamada externa. Sem
  precessao, nutacao e refracao, o erro fica em fracoes de grau, suficiente
  para apontar o celular.
- **Lua e planetas**: posicao aparente consultada no
  [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (`horizons.client.ts`),
  servico publico da NASA/JPL que nao exige chave.

Protecoes do cliente do Horizons:

- O ID do objeto precisa ser numerico (ate 9 digitos), pois e interpolado no
  parametro `COMMAND` da consulta.
- Timeout de 8 s por requisicao; ate 3 tentativas para status 429, 502, 503 e
  504, com espera crescente (300 ms, 600 ms).
- No maximo 3 requisicoes simultaneas por processo, compartilhadas entre
  todos os usuarios; o Horizons responde rajadas com 503.
- Erros de requisicao chegam com HTTP 200 e um campo `error`; sao tratados
  como `REJECTED`, e nao como resposta valida.
- Falhas viram `AstronomyProviderError` (`UNAVAILABLE`, `INVALID_RESPONSE` ou
  `REJECTED`); o conteudo da resposta externa nao e repassado.

`CachedEphemerisProvider` guarda posicoes em memoria por 10 minutos (ate 1000
entradas). Pedidos sao arredondados para o minuto e para cerca de 100 m, entao
usuarios proximos compartilham o resultado; em um minuto o ceu gira 0,25 grau.
Pedidos identicos simultaneos geram uma unica chamada, e falhas nao sao
guardadas. O cache e por processo e reinicia com ele.

`tests/fixtures/horizons-moon-observer.json` e uma resposta real do Horizons
(Lua vista de Campinas em 2026-06-01T00:00Z). Os testes usam essa resposta para
validar o parser e para conferir que a conversao local fica a menos de 0,05
grau do azimute e da elevacao calculados pelo JPL. Os testes nao acessam a rede.

## Guia do ceu

`POST /api/v1/sky-guide/positions` exige bearer token e informa onde estao
objetos do catalogo para uma localizacao e um instante:

```json
{
  "objectIds": ["moon", "jupiter", "crux"],
  "observer": { "latitudeDegrees": -22.9, "longitudeDegrees": -47.06, "elevationMeters": 600 },
  "observedAt": "2026-06-01T21:00:00-03:00"
}
```

- `objectIds`: 1 a 20 IDs do catalogo; duplicados sao ignorados e a ordem
  pedida e mantida.
- `observedAt` e opcional (padrao: agora), em ISO 8601 com fuso, ate um ano
  antes ou depois do momento atual. A resposta devolve o instante em UTC.
- `elevationMeters` e opcional (padrao 0).

Cada posicao traz altitude, azimute (a partir do norte verdadeiro, no sentido
leste) e `aboveHorizon`. Estrelas e constelacoes sao calculadas localmente;
Lua e planetas vem do JPL Horizons, atraves do cache.

Falhas parciais nao derrubam a requisicao: IDs desconhecidos aparecem em
`unavailable` com `NOT_FOUND`, e objetos cujo calculo no Horizons falhou, com
`PROVIDER_UNAVAILABLE`. Erros inesperados continuam retornando `500`.

A rota usa `POST` para que a localizacao do usuario fique no corpo, fora de
URLs e de logs de acesso de proxies e da hospedagem. A API tambem nao registra
a localizacao nos proprios logs.

### Nascer, passagem e por

`POST /api/v1/sky-guide/rise-set` com `{ objectIds, observer, from? }` calcula,
para ate 10 objetos, os eventos das 24 horas seguintes a `from` (padrao: agora;
ate um ano de distancia). Nada e gravado no banco.

- Cada objeto traz `events` em ordem (tipo, horario, azimute e altitude) e
  `horizon`: `rises-and-sets`, `always-above` (nunca se poe naquela latitude)
  ou `always-below` (nunca nasce). Como o dia sideral tem 23 h 56 min, uma
  janela de 24 horas pode ter duas passagens.
- Estrelas e constelacoes: calculo analitico pelo angulo horario, com o
  horizonte refratado padrao (-0,567 grau), sem chamada externa.
- Lua e planetas: uma chamada ao Horizons por objeto (`R_T_S_ONLY`), com
  resolucao de 1 minuto, refracao e paralaxe da Lua. O cache amplia a janela
  para horas cheias e guarda o resultado por 6 horas.
- O Horizons supoe um horizonte ao nivel do mar e inclui a depressao do
  horizonte pela altitude do observador (cerca de 0,8 grau a 600 m); o calculo
  local das estrelas nao aplica essa correcao, o que gera diferencas de poucos
  minutos para observadores em altitude.

IDs desconhecidos e falhas do Horizons aparecem em `unavailable`, como em
`/positions`.

## Clima (Open-Meteo)

O modulo `weather` obtem previsao horaria do
[Open-Meteo](https://open-meteo.com/), servico publico que nao exige chave.
Nao tem rotas proprias; e usado pelas condicoes de observacao e pelo
planejamento.

Cada hora traz temperatura, umidade relativa, probabilidade e volume de
precipitacao, cobertura de nuvens, visibilidade e vento, sempre em UTC e em
unidades metricas. Valores ausentes no modelo chegam como `null`, sem invalidar
a previsao. `gridLocation` informa o ponto da grade do modelo, que pode diferir
da coordenada pedida.

Protecoes do `OpenMeteoClient`, no mesmo padrao do Horizons:

- Timeout de 8 s; ate 3 tentativas para 429 e 5xx, com espera crescente.
- No maximo 4 requisicoes simultaneas por processo.
- Datas fora do alcance da previsao (cerca de 92 dias atras a 16 dias a frente)
  retornam HTTP 400 no Open-Meteo e viram `REJECTED`, sem nova tentativa.
- Falhas viram `WeatherProviderError` (`UNAVAILABLE`, `INVALID_RESPONSE` ou
  `REJECTED`); o conteudo da resposta externa nao e repassado.

`CachedWeatherProvider` arredonda as coordenadas para 0,01 grau (cerca de 1 km;
a grade do modelo e maior) e consulta dias UTC inteiros, guardando o resultado
por 30 minutos (ate 500 entradas). Assim, janelas diferentes do mesmo dia e
usuarios proximos reaproveitam uma unica consulta; cada chamador recebe apenas
as horas pedidas. Pedidos identicos simultaneos sao unificados e falhas nao
sao guardadas.

`tests/fixtures/open-meteo-forecast.json` e uma resposta real (Campinas,
2026-10-24) usada pelos testes, que nao acessam a rede.

O limitador de concorrencia dos dois clientes externos fica em
`src/shared/http/semaphore.ts`.

## Condicoes de observacao

Duas rotas autenticadas, ambas com `POST` para manter a localizacao fora de
URLs e logs:

- `POST /api/v1/conditions/current` com `{ observer, at? }`: avalia um instante
  (padrao: agora; aceita ate 1 hora no passado e 7 dias a frente). O clima vem
  da hora de previsao mais proxima; a altitude do Sol, do instante exato.
- `POST /api/v1/conditions/forecast` com `{ observer }`: 168 avaliacoes
  horarias, a partir da proxima hora cheia (UTC).

Cada hora traz os valores do clima (podem ser `null`), `sunAltitudeDegrees`,
fatores e uma classificacao geral:

| Fator           | `good`          | `caution`              | `poor`          |
| --------------- | --------------- | ---------------------- | --------------- |
| `darkness`      | Sol <= -18 grau | -18 a -6 (crepusculo)  | Sol > -6 grau   |
| `cloud-cover`   | <= 20%          | <= 60%                 | > 60%           |
| `precipitation` | <= 10% e < 0,1 mm | <= 30% e <= 1 mm     | acima disso     |
| `visibility`    | >= 10 km        | >= 5 km                | < 5 km          |
| `wind`          | <= 15 km/h      | <= 30 km/h             | > 30 km/h       |
| `humidity`      | <= 80%          | <= 90%                 | > 90%           |

Valores ausentes viram `unknown`. `rating` e `poor` se qualquer fator critico
(todos, exceto umidade, que so indica risco de orvalho) for `poor`; `good` se
todos forem `good`; `fair` nos demais casos, inclusive com `unknown`.

A API devolve apenas codigos e numeros; o app monta os textos no idioma do
usuario. A altitude do Sol e calculada localmente (formula de baixa precisao do
Astronomical Almanac, erro de cerca de 0,01 grau, conferido contra o JPL
Horizons nos testes), sem chamada externa. Falhas do Open-Meteo retornam
`503 CONDITIONS_UNAVAILABLE`.

Mudancas em relacao a API antiga: o fator `darkness` (antes, meio-dia de ceu
limpo era avaliado como bom), os textos em portugues gerados pela API
(`skyLabel`, `summary`) foram removidos e a localizacao saiu da query string.

## Planejamento de observacao

`POST /api/v1/planning/recommendation` exige bearer token e encontra a melhor
janela para observar um objeto do catalogo:

```json
{
  "objectId": "crux",
  "observer": { "latitudeDegrees": -22.9, "longitudeDegrees": -47.06 },
  "windowFrom": "2026-06-01T19:00:00-03:00",
  "windowTo": "2026-06-02T05:00:00-03:00",
  "minimumAltitudeDegrees": 20
}
```

- A janela dura ate 24 horas, comeca no maximo 1 hora antes de agora e termina
  em ate um ano. `minimumAltitudeDegrees` vai de 0 a 80 (padrao 20).
- A janela e amostrada a cada 15 minutos. Uma amostra e favoravel quando o
  objeto esta na altitude minima ou acima e a avaliacao das condicoes (a mesma
  de `/conditions`, incluindo escuridao) nao e `poor`.
- A recomendacao e o trecho favoravel continuo mais longo (o mais cedo em caso
  de empate), com o horario e a altitude do pico.
- Sem janela, `rejections` conta as amostras abaixo da altitude minima e com
  condicoes ruins; o app pode explicar o motivo no idioma do usuario.
- `samples` traz todas as amostras, para o app desenhar a curva de altitude.

Estrelas e constelacoes sao calculadas localmente. Para Lua e planetas, a API
faz apenas duas consultas ao Horizons (inicio e fim da janela) e interpola
ascensao reta e declinacao entre elas; o erro fica abaixo de 1 grau para a Lua
(0,2 grau na verificacao contra o Horizons) e e desprezivel para planetas. Se
o Horizons falhar, a rota retorna `503 PLANNING_UNAVAILABLE`.

Se o clima nao estiver disponivel, por exemplo em janelas alem dos 16 dias de
previsao, a recomendacao continua considerando apenas a escuridao, com
`weatherAvailable: false` e `rating: null` nas amostras.

## Eventos astronomicos

`GET /api/v1/events` e `GET /api/v1/events/{id}` exigem bearer token e leem os
eventos **curados** da tabela `astronomical_events` (eclipses, chuvas de
meteoros, conjuncoes), cadastrados no Supabase.

- Parametros: `from` (padrao: agora), `to` (padrao: `from` + 90 dias; intervalo
  de ate 1 ano), `type` (slug como `meteor-shower`) e `limit` (1 a 100, padrao 50).
- Retorna eventos que se sobrepoem ao intervalo, inclusive os ja em andamento,
  ordenados pelo inicio.
- A consulta usa o JWT do usuario; a RLS libera apenas eventos publicados.
  A API tambem filtra `provider = 'manual'` e `published = true`, entao linhas
  gravadas pelo antigo job de sincronizacao por localizacao nunca aparecem.
- Titulo e descricao sao conteudo cadastrado, no idioma em que foram escritos.

A API antiga calculava nascer, passagem e por de cada corpo por localizacao,
gravando o resultado nessa mesma tabela por um job agendado. Esse modelo foi
descontinuado: esses horarios sao calculados na hora, sem persistencia, em
`POST /api/v1/sky-guide/rise-set`. As
colunas e a tabela `astronomical_event_sync_runs` criadas para o job continuam
no banco ate uma migration de limpeza no `veronica-lens-database`.

## Trilhas e licoes

Todas as rotas exigem bearer token. Trilhas e licoes sao **somente leitura**
para o usuario: o conteudo e publicado pelo banco (`learning_tracks` e
`lessons`). O progresso e gravado **por usuario** em `user_learning_progress`.

- `GET /api/v1/learning/tracks`: trilhas publicadas, com resumo de progresso
  (`totalLessons`, `completedLessons`, `percent`).
- `GET /api/v1/learning/tracks/{slug}`: trilha com suas licoes.
- `GET /api/v1/learning/lessons/{id}`: licao com `content` e o progresso do usuario.
- `PUT /api/v1/learning/lessons/{id}/progress`: grava o progresso do usuario.
  - `not_started`: zera o progresso.
  - `in_progress`: exige `progressPercent` de 1 a 99.
  - `completed`: grava 100% e a data de conclusao.
- Licoes de trilhas nao publicadas retornam 404, mesmo com o id correto.
- O progresso so e lido e gravado pelo proprio usuario (RLS).

## Observacoes

Todas as rotas exigem bearer token e usam o JWT do usuario, so enxergando as
proprias observacoes pela RLS.

- `GET /api/v1/observations?page=1&pageSize=20` lista as observacoes do mais
  novo para o mais antigo (`pageSize` de 1 a 50). Cada foto traz uma URL
  assinada de 1 hora. `hasMore` indica se ha outra pagina.
- `PUT /api/v1/observations/{observationId}/photos/{photoId}` recebe os bytes
  da foto no corpo, com `Content-Type` JPEG, PNG, WebP, HEIC ou HEIF (ate 50 MB).
  Os metadados de captura vao no header `x-veronica-observation`, como JSON
  codificado em URL, para o corpo continuar binario. A API confere a assinatura
  do arquivo contra o tipo declarado. Cria ou substitui a observacao e a foto.
- `DELETE /api/v1/observations/{observationId}/photos/{photoId}` remove o
  arquivo primeiro. Se nao sobrar foto, a observacao tambem e apagada e a
  resposta traz `observationDeleted: true`.
- `DELETE /api/v1/observations/{observationId}` remove a observacao e todas as
  fotos, com 204.

Erros de banco ou de Storage nunca expõem detalhes internos. Falha de banco
retorna `503 OBSERVATION_UNAVAILABLE`; falha de Storage, `503
OBSERVATION_STORAGE_UNAVAILABLE`, exceto tamanho (413), tipo (415) e token (401),
que seguem o status do Storage.

## Notificacoes push

Os dispositivos usam tokens Expo (`ExponentPushToken[...]`). Rotas de usuario
exigem bearer token e so alteram os proprios tokens (RLS).

- `PUT /api/v1/notifications/devices` registra ou atualiza o token com
  `{ "token", "platform": "android" | "ios" }`. Um token ja vinculado a outro
  usuario retorna `409 DEVICE_TOKEN_IN_USE`.
- `DELETE /api/v1/notifications/devices/{token}` remove o token, com 204.
  Token malformado ou inexistente nao gera erro.
- `POST /api/v1/notifications/dispatch` envia as notificacoes devidas. Nao usa
  token de usuario: exige `Authorization: Bearer <NOTIFICATIONS_DISPATCH_SECRET>`.
  Sem o segredo configurado, responde `503 DISPATCH_DISABLED`.

Regra de envio: eventos publicados nas proximas 30 dias. Um evento e enviado
quando `agora >= starts_at - lead_minutes` da preferencia do usuario
(`event_preferences`). Cada par evento/dispositivo e gravado em
`notification_deliveries` antes do envio, o que evita duplicidade em execucoes
repetidas. Tokens que a Expo marca como `DeviceNotRegistered` sao desativados.

Limitacoes conhecidas:

- `sent` significa que a Expo aceitou a mensagem, nao que ela foi entregue. Os
  recibos da Expo nao sao consultados.
- Se a execucao cair depois de gravar os registros pendentes e antes do envio,
  esses registros ficam `pending` e nao sao reenviados automaticamente.
- A lista de usuarios para `in()` nao e dividida em lotes.
- O envio precisa de um agendador externo (por exemplo, cron ou GitHub Actions)
  que chame o endpoint de dispatch periodicamente.

## Exclusao de conta

`DELETE /api/v1/account` exige bearer token e o corpo
`{ "confirmation": "DELETE" }`. A exclusao e irreversivel.

Ordem das etapas, executadas com a chave secreta:

1. Remove os arquivos do bucket `observations` listados em `observation_media`.
2. Remove os arquivos da pasta do usuario no bucket `avatars`.
3. Exclui o usuario no Supabase Auth; as linhas do banco ligadas a
   `auth.users` sao removidas por `on delete cascade`.

Os arquivos sao removidos antes porque o cascade nao alcanca o Storage. Se uma
etapa falhar, as seguintes nao rodam e a API retorna
`503 ACCOUNT_DELETION_UNAVAILABLE`; repetir a requisicao continua de onde
parou. Um usuario ja inexistente no Auth e tratado como excluido.

A frase de confirmacao evita exclusao acidental, mas **nao protege contra um
access token vazado**. Quando o login com Google estiver implementado, avalie
exigir reautenticacao recente. Access tokens ja emitidos continuam validos ate
expirar; o app deve apagar a sessao local apos a resposta `204`.

Arquivos em `observations` que nao estejam registrados em `observation_media`
nao sao encontrados por essa listagem.

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

Cadastro, login (senha e Google), refresh, recuperacao e atualizacao de senha compartilham
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
