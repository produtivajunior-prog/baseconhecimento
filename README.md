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
  ferramentas-mapa.json   por ferramenta: categoria, anexos (ids do Drive), entradas/saídas, stubs
  escopos-mapa.json       por escopo: coluna do Resumão, cronograma base, ferramentas por etapa
src/
  index.html       marcação da interface (sintaxe <sc-if> / <sc-for> do dc-runtime)
  app.js           lógica: class Component extends DCLogic
  tail.html        fechamento do documento
  data/            o acervo, como dado editável
    taxonomia.json          fonte única de tipos, categorias, grupos de escopo, status, cores
    ferramentas.json        ferramentas promovidas (hoje: as 13 herdadas, marcadas como legado)
    escopos.json            escopos promovidos, com etapas ordenadas e ferramentas por etapa
    problemas.json          problemas → ferramentas (tela "Recomendar")
    modelos.json            modelos-padrão (blocos que a IA preenche)
    documento-padrao.json   documento PMMC (10 seções, do PDF oficial)
    rascunhos/              rascunhos gerados de fontes/, aguardando revisão — NUNCA entram no pack
assets/            logo e fontes; index.json mapeia uuid ↔ arquivo
vendor/            dc-runtime.js, React embutido e o invólucro do bundle
tools/             pack / verify / rascunho / promover / smoke / unpack
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

Itens herdados do MVP (sem `revisao`) passam com aviso enquanto `taxonomia.legadoPermitido`
for `true`; `node tools/promover.mjs --remover-legado` os tira quando o acervo real entrar.

## Navegação e uso

- **URL acompanha a tela**: `#/biblioteca`, `#/ferramenta/<id>`, `#/escopos`, `#/escopo/<id>`, `#/cases`,
  `#/case/<id>`, `#/cases/novo`, `#/cadastrar`, `#/docs`, `#/recomendar`. Dá para compartilhar o link de
  uma ferramenta ou case, usar o botão "voltar" do navegador e recarregar sem perder a tela. Funciona em `file://`.
- **Teclado**: `/` foca a busca da tela; `Esc` fecha a janela de anexos; foco visível em todos os controles.
- **Comece aqui** (`#/comece`): trilha do primeiro projeto em seis passos marcáveis (ficam no navegador), as
  ferramentas mapeadas em mais etapas, quem procurar e o glossário. Os termos vêm de `src/data/trilha.json`,
  cada um com `origem`; os marcados `pendente: true` aparecem como "a confirmar" até o CIEP validar.
- **Material para a reunião**: na ficha da ferramenta, "Abrir material para imprimir" gera uma página com
  perguntas-chave, o que pedir ao cliente, passo a passo e, quando há modelo em canvas, o canvas em branco.
- **Pergunte a quem fez**: na ficha do case, botões de e-mail e WhatsApp para a equipe, com a mensagem já
  escrita. O WhatsApp é opcional no cadastro.
- **Celular**: menu em segunda linha rolável, filtros da Biblioteca e dos Cases atrás de um botão "Filtros",
  grades e formulários em uma coluna. Nada rola na horizontal.

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

1. **Revisar os rascunhos** em `src/data/rascunhos/` (31 ferramentas, 20 escopos). Cada dono
   confere os itens da sua área pelo checklist de `fontes/README.md` e marca `revisao.aprovado`.
2. **Promover**: `node tools/promover.mjs --aprovados --remover-legado`, depois `pack` + `verify`.
3. **Colar do Hangar** as páginas das ferramentas sem PDF (BMC, BPMN, SIPOC, RACI, Jornada,
   PCO, IBACO, FIB, MLQ, DCO, Gamificação…) em `fontes/hangar/`, e regerar o rascunho.
4. Os 11 escopos despriorizados já têm rascunho; entram quando thiagomelo@ decidir.

Fora do escopo desta reconstrução e ainda abertos: backend para a IA, persistência, login e
o aviso de LGPD no campo "Insumos do projeto" (ver DIAGNOSTICO.md §9 e §11).
