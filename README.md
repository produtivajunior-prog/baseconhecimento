# Hangar — Produtiva Júnior

Hangar: a base interna de ferramentas, escopos e cases de consultoria da Produtiva Júnior, para uso dos
consultores de projeto.

> **Estado atual:** estrutura reconstruída em dois eixos (Ferramentas × Escopos) e acervo real
> extraído do Drive em **rascunho**, aguardando revisão dos donos de cada área. O bundle oficial
> (`dist/Hangar.html`) só recebe conteúdo aprovado; a prévia com os rascunhos fica em
> `dist/Hangar.preview.html`. Leia [fontes/README.md](fontes/README.md) para revisar e
> promover, e o [DIAGNOSTICO.md](DIAGNOSTICO.md) para o histórico.

---

## Estrutura

```
original/          bundle herdado do MVP, intacto — só histórico
fontes/            de onde vem cada texto (ver fontes/README.md)
  drive/<id>.txt          texto extraído de cada PDF/planilha do Drive, com cabeçalho e hash
  hangar/<slug>.md        páginas do Hangar Academy coladas à mão
  inventario.json         índice dos arquivos extraídos
  ppgp-2026/              [PPGP 2026] Revisão dos Escopos: o PDF (base dos 16 escopos) e a extração verbatim
  ferramentas-mapa.json   por ferramenta: categoria, anexos (ids do Drive), entradas/saídas, stubs
  escopos-mapa.json       por escopo: texto curado do PPGP, ferramentas por etapa/entregável, cronograma base
src/
  index.html       marcação da interface (sintaxe <sc-if> / <sc-for> do dc-runtime)
  app.js           lógica: class Component extends DCLogic
  tail.html        fechamento do documento
  data/            o acervo, como dado editável
    taxonomia.json          fonte única de tipos, categorias, grupos de escopo, status, cores
    ferramentas.json        ferramentas promovidas (27: 26 do acervo real + n8n; 20 ainda "Em construção")
    escopos.json            os 16 escopos do PPGP 2026: estudar, etapas (com ferramentas), entregáveis, saber, riscos, cases
    problemas.json          problemas → ferramentas (tela "Recomendar")
    modelos.json            modelos-padrão (blocos que a IA preenche)
    documento-padrao.json   documento PMMC (10 seções, do PDF oficial)
    produtiva.json          página "Como funciona a Produtiva": áreas, subnúcleos, fluxo comercial
    rascunhos/              rascunhos gerados de fontes/, aguardando revisão — NUNCA entram no pack
assets/            logo e fontes; index.json mapeia uuid ↔ arquivo
vendor/            dc-runtime.js, React embutido e o invólucro do bundle
tools/             pack / verify / rascunho / promover / smoke / unpack / ppgp-extrair.py
dist/              artefatos gerados — não editar à mão
```

## Fluxo de trabalho

O distribuível é um HTML único que abre com duplo clique, sem servidor e sem instalação.
Ele é **gerado**, nunca editado direto.

```bash
node tools/pack.mjs                  # src/ + data/ + assets/ → dist/Hangar.html (só conteúdo aprovado)
node tools/pack.mjs --com-rascunhos  # prévia com src/data/rascunhos/ → dist/Hangar.preview.html
node tools/verify.mjs                # valida schema, referências e revisão; prova que dist/ carrega src/data
node tools/smoke.mjs [arquivo]       # abre no Chromium sem rede e navega (exige playwright)
node tools/unpack.mjs                # só para reimportar um bundle de fora
```

**Para trazer conteúdo do acervo** (Drive ou Hangar): siga [fontes/README.md](fontes/README.md) —
extrair → `tools/rascunho.mjs` → revisão do dono → `tools/promover.mjs` → `pack` + `verify`.

**Para corrigir conteúdo já promovido:** edite `src/data/*.json`, mantenha `origem` e `revisao`
coerentes, e rode `pack` + `verify`.

**Para mudar comportamento ou layout:** `src/app.js` e `src/index.html`. Tipos, categorias,
status e cores vêm de `src/data/taxonomia.json`; não crie lista literal no código.

⚠️ Editar `dist/` ou `original/` à mão corrompe o bundle — o template é uma string JSON
escapada dentro do HTML.

### O que o verify garante

`tools/verify.mjs` deixou de comparar com o MVP e passou a validar o acervo:

- **schema** — cada ferramenta e escopo tem os campos certos, com valores de `taxonomia.json`;
  itens do acervo real não podem ter `acessos`, `nota` nem `etapa`; datas em ISO
- **integridade** — `problemas.ids`, `modelos.toolId` e `escopos.etapas[].ferramentas` apontam
  para ferramentas que existem
- **revisão** — nada entra em `ferramentas.json`/`escopos.json` sem `revisao.status = "aprovado"`
  por e-mail `@produtivajunior.com.br`
- **round-trip** — o bundle em `dist/` carrega exatamente o que está em `src/data/`
- **assets e markup** — bytes dos assets e a marcação batem com `assets/` e `src/index.html`

Os 13 itens herdados do MVP saíram em 2026-09-15 (`promover.mjs --remover-legado`); campos que a
fonte não tinha ficam `null` com a pendência registrada, e o verify aceita isso.

## Navegação e uso

- **URL acompanha a tela**: `#/biblioteca`, `#/ferramenta/<id>`, `#/escopos`, `#/escopo/<id>`, `#/cases`,
  `#/case/<id>`, `#/cases/novo`, `#/cadastrar`, `#/docs`, `#/recomendar`. Dá para compartilhar o link de
  uma ferramenta ou case, usar o botão "voltar" do navegador e recarregar sem perder a tela. Funciona em `file://`.
- **Teclado**: `/` foca a busca da tela; `Esc` fecha a janela de anexos; foco visível em todos os controles.
- **Comece aqui** (`#/comece`): trilha do primeiro projeto em seis passos marcáveis (ficam no navegador), as
  ferramentas mapeadas em mais etapas e o glossário. Os termos vêm de `src/data/trilha.json`,
  cada um com `origem`; os marcados `pendente: true` aparecem como "a confirmar" até o CIEP validar.
- **Como funciona a Produtiva** (`#/produtiva`): página de boas-vindas com o que é a Produtiva e as áreas
  de atuação (cada uma abre os escopos do grupo), as 5 áreas da empresa com "o que faz" e "procure quando",
  os subnúcleos de Projetos (CIEP, CIT, CS), o caminho do primeiro contato ao projeto (SDR → closer → gerente
  → proposta → execução → CSAT → case) e como o membro é acompanhado. O conteúdo fica em
  `src/data/produtiva.json` e é validado pelo `verify`.
- **Escopos** (`#/escopos`): os 16 escopos da Revisão dos Escopos (PPGP 2026), com busca por entregável, ferramenta,
  cliente ou etapa. Cada escopo tem cinco blocos: o que estudar, o Diagnóstico Inicial, as etapas, os entregáveis e os cases.
  - **Diagnóstico Inicial:** checklist "O que saber" (as marcações ficam no navegador) e os pontos de risco.
  - **Etapas:** mostram as ferramentas da Biblioteca e, em Cultura, as frentes.
  - **Cases:** os projetos que a Produtiva já fez, ligados ao Banco de Cases. O botão "+ ficha" abre o cadastro já preenchido.
  - **Roteiro do Diagnóstico Inicial:** gera a folha para imprimir.
  - **Links antigos:** `#/escopo/gamificacao` e outros ids de escopos fundidos redirecionam para o escopo novo.
- **Material para a reunião**: na ficha da ferramenta, "Abrir material para imprimir" gera uma página com
  perguntas-chave, o que pedir ao cliente, passo a passo e, quando há modelo em canvas, o canvas em branco.
- **Pergunte a quem fez**: na ficha do case, botões de e-mail e WhatsApp para a equipe, com a mensagem já
  escrita. O WhatsApp é opcional no cadastro.
- **Celular**: menu em segunda linha rolável, filtros da Biblioteca e dos Cases atrás de um botão "Filtros",
  grades e formulários em uma coluna. Nada rola na horizontal.

## Revisão do acervo

- `node tools/aprovar.mjs <ids|--todos> --revisor <e-mail>` registra a aprovação de rascunhos (quem, quando,
  próxima revisão em 3 meses). `node tools/promover.mjs --aprovados` leva para o acervo.
- `node tools/revisao.mjs` imprime a agenda do ritual trimestral por dono; o painel do CIEP (tela
  Cadastrar) mostra o que venceu; `verify` avisa. Detalhes em `fontes/README.md`, seção 7.
- Hangar Academy: `tools/hangar-extrator.js` (roda no navegador de quem tem acesso) +
  `node tools/hangar-importar.mjs` trazem as páginas para `fontes/hangar/`. Seção 2 de `fontes/README.md`.

## Publicar na web (Coolify)

O repositório já tem `Dockerfile` + `deploy/nginx.conf`: um nginx que serve `dist/Hangar.html`
como `index.html` (gzip, HTML sem cache, `/healthz` para health check).

1. No Coolify: **+ New → Application → Public/Private Repository (GitHub)** e escolha
   `produtivajunior-prog/baseconhecimento`, branch `main` (depois do merge do PR).
2. **Build Pack: Dockerfile** (caminho `/Dockerfile`), **porta exposta: 80**.
3. Em **Domains**, informe o domínio (ex.: `https://hangar.seudominio.com.br`); o Coolify emite o HTTPS.
4. **Deploy.** Com o GitHub App do Coolify, cada push na `main` publica sozinho.

Para atualizar o site: edite `src/`, rode `node tools/pack.mjs && node tools/verify.mjs`, faça commit
do `dist/Hangar.html` e dê push. Testar localmente: `docker build -t hangar . && docker run -p 8080:80 hangar`.

## Limitações conhecidas

| | |
|---|---|
| ✅ **React via unpkg.com** | **Resolvido.** O `dc-runtime` baixava React de CDN em runtime; sem internet a página renderizava o template cru, com `{{ item.nome }}` visível na tela. React 18.3.1 agora vai embutido no bundle, carregado antes do runtime. Verificado em Chromium com o unpkg inacessível. |
| 🔴 **`window.claude.complete`** | Só existe dentro do sandbox de artifacts da Claude.ai. Como a distribuição é por download do HTML, **as 4 funcionalidades de IA falham em 100% das tentativas** hoje, com mensagem que sugere erro do usuário. Exige backend — não dá para resolver dentro do bundle. |

Além disso: nada persiste (F5 apaga tudo), não há login, e os anexos são apenas metadados —
nenhum arquivo existe por trás dos botões "Baixar".

> Ruído esperado no console em `file://`: `dc-runtime.js:154` faz `fetch(location.href)` para
> recarregar o template (recurso de editor). É bloqueado por CORS, já tratado pelo `.catch()`
> do próprio runtime, e não afeta o funcionamento.

Detalhes e o resto do inventário no [DIAGNOSTICO.md](DIAGNOSTICO.md).

## Próximos passos

1. **Completar os 20 itens "Em construção"**: são as ferramentas sem PDF de metodologia no Drive
   (BMC, BPMN, SIPOC, RACI, Jornada, PCO, IBACO, FIB, MLQ, DCO, Gamificação, n8n…). O caminho mais curto é
   trazer as páginas do Hangar Academy com `tools/hangar-extrator.js` + `node tools/hangar-importar.mjs`
   (seção 2 de `fontes/README.md`) e regerar os rascunhos.
2. **Donos de área revisam a primeira carga**: as 27 ferramentas (2026-09-15) e os 16 escopos do PPGP 2026 (2026-09-24)
   foram aprovados pela conta institucional; cada dono confere os da sua área na próxima revisão (`node tools/revisao.mjs`).
3. **Pendências do PPGP 2026** com o CIEP: o significado dos itens marcados com ✱, o slide de Custeio e
   Precificação (que repete o de Gerenciamento Financeiro) e as etapas de Prosel. Ver `fontes/README.md`.
4. **Glossário**: o CIEP confirma os termos "a confirmar" em `src/data/trilha.json`.

Fora do escopo desta reconstrução e ainda abertos: backend para a IA, persistência, login e
o aviso de LGPD no campo "Insumos do projeto" (ver DIAGNOSTICO.md §9 e §11).
