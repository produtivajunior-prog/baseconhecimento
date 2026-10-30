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
  ppgp-2026/              [PPGP 2026] Revisão dos Escopos: o PDF (base dos escopos) e a extração verbatim
  ferramentas-mapa.json   por ferramenta: categoria, anexos (ids do Drive), entradas/saídas, stubs
  escopos-mapa.json       por escopo: texto curado do PPGP, ferramentas por etapa/entregável, cronograma base
src/
  index.html       marcação da interface (sintaxe <sc-if> / <sc-for> do dc-runtime)
  app.js           lógica: class Component extends DCLogic
  tail.html        fechamento do documento
  data/            o acervo, como dado editável
    taxonomia.json          fonte única de tipos, categorias, grupos de escopo, status, cores
    ferramentas.json        ferramentas promovidas (27: 26 do acervo real + n8n; 20 ainda "Em construção")
    escopos.json            os 15 escopos do PPGP 2026 em execução: estudar, etapas (com ferramentas), entregáveis, saber, riscos, cases
    problemas.json          problemas → ferramentas (tela "Recomendar")
    modelos.json            modelos-padrão (blocos que a IA preenche)
    documento-padrao.json   documento PMMC (10 seções, do PDF oficial)
    produtiva.json          páginas "Como funciona" (áreas, subnúcleos, fluxo comercial) e "Auxílios e reembolsos"
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
- **Busca geral** (campo da Biblioteca, lupa do topo ou Enter na busca do Início): procura em todo o Hangar,
  sem acento e sem caixa, com as palavras em qualquer ordem. Lista as ferramentas (as que têm o termo no nome
  primeiro) e, acima delas, os cases, escopos, termos do glossário, passos do Comece aqui, partes do Como funciona,
  auxílios e problemas do Recomendar que citam o termo, com o trecho onde ele aparece. Cada resultado abre a tela certa.
- **Teclado**: `/` foca a busca da tela; `Esc` fecha a janela de anexos, o resultado da IA e a confirmação; foco visível em todos os controles.
- **Nada some sem perguntar**: remover case, capa, vídeo, modelo-padrão ou bloco da documentação, limpar o
  formulário de case ou o checklist "O que saber" passam por um modal de confirmação (`pedirConfirmacao` em `src/app.js`).
- **Mensagens honestas**: o toast mostra `✓` ou `!` conforme o resultado, dura mais quando o texto é longo e
  diz "salvo neste navegador" sempre que algo ainda não foi publicado; ferramentas criadas no navegador levam o
  selo "Só aqui" na Biblioteca e na ficha. "Esse conteúdo foi útil?" abre um e-mail para o responsável da
  ferramenta com a avaliação e a sugestão; "Baixar" no resultado da IA gera o HTML imprimível da ferramenta preenchida.
- **Comece aqui** (`#/comece`): trilha do primeiro projeto em seis passos marcáveis (ficam no navegador), as
  ferramentas mapeadas em mais etapas e o glossário. Os termos vêm de `src/data/trilha.json`,
  cada um com `origem`; os marcados `pendente: true` aparecem como "a confirmar" até o CIEP validar.
- **Como funciona a Produtiva** (`#/produtiva`): página de boas-vindas com o que é a Produtiva e as áreas
  de atuação (cada uma abre os escopos do grupo), as 5 áreas da empresa com "o que faz" e "procure quando",
  os subnúcleos de Projetos (CIEP, CIT, CS), o caminho do primeiro contato ao projeto (SDR → closer → gerente
  → proposta → execução → CSAT → case) e como o membro é acompanhado. O conteúdo fica em
  `src/data/produtiva.json` e é validado pelo `verify`.
- **Auxílios e reembolsos** (`#/auxilios`, item "Auxílios" do menu): página própria com o PIPJ (valores por
  cargo, o que entra no cálculo, a fórmula com teto de R$ 300, ajustes e casos especiais, e as regras de uso),
  auxílio-alimentação, reembolso de gasolina (com link da planilha), Uber Business e computadores. Fontes: Guia
  de Benefícios dos Membros e Cálculo do PIPJ (2026); regras de uso do PIPJ e computadores vêm do manual de 2025.
  Os dados ficam em `auxilios` dentro de `src/data/produtiva.json`; cada item pode trocar os títulos das seções
  (`rotuloQuando`, `rotuloPassos`, `rotuloRegras`) e ter um `link`.
- **Escopos** (`#/escopos`): os 15 escopos da Revisão dos Escopos (PPGP 2026) que a Produtiva executa (o EVE foi descontinuado), com busca por entregável, ferramenta,
  cliente ou etapa. Cada escopo tem cinco blocos: o que estudar, o Diagnóstico Inicial, as etapas, os entregáveis e os cases.
  - **Diagnóstico Inicial:** checklist "O que saber" (as marcações ficam no navegador) e os pontos de risco.
  - **Etapas:** mostram as ferramentas da Biblioteca e, em Cultura, as frentes.
  - **Cases:** os projetos que a Produtiva já fez, ligados ao Banco de Cases. O botão "+ ficha" abre o cadastro já preenchido.
  - **Roteiro do Diagnóstico Inicial:** gera a folha para imprimir.
  - **Links antigos:** `#/escopo/gamificacao` e outros ids de escopos fundidos redirecionam para o escopo novo.
- **Foto de capa dos cases**: cada card da galeria de Cases tem o botão "Adicionar capa" / "Trocar capa", e a ficha
  tem "Adicionar/Trocar foto de capa" e "Remover capa". A foto é reduzida no navegador (WebP/JPEG até ~900 KB). Em case
  que só existe neste navegador, ela vai direto para o case; em case já publicado, fica só neste navegador
  (`hangar.capas`) com o aviso para baixar o JSON e enviar ao CIEP.
- **Vídeo dos cases**: a ficha tem "Adicionar vídeo" / "Trocar vídeo" / "Remover vídeo". O arquivo nunca entra no
  Hangar (vídeos passam fácil de 100 MB): sobe no Google Drive ou no YouTube (não listado) e o case guarda só o link,
  embutido na ficha. Só vale para case que ainda está no navegador de quem cadastrou: em case já publicado, o vídeo
  não pode ser trocado nem removido pelo site (só o CIEP altera, no `cases.json`), a não ser pelo "Editar case".
- **Editar case**: a ficha tem "Editar case" (e "Completar case" quando falta algo: documentos, vídeo, foto ou
  resultados). O formulário reabre preenchido (`#/case/<id>/editar`) e "Salvar alterações" atualiza o mesmo case, com o
  mesmo id, mantendo quem cadastrou e registrando quem editou. Dá para cadastrar sem documentos e completar depois.
  Em case já publicado pelo CIEP, a edição fica neste navegador (`edicaoLocal`) no lugar do publicado, com aviso para
  baixar o JSON e enviar ao CIEP, e o botão "Desfazer alterações"; quando o CIEP publica uma versão igual ou mais nova,
  ela volta a valer.
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

### Endereço alternativo (Vercel)

Redes com firewall que bloqueia "Dynamic DNS" (ex.: Wi-Fi da UFRN, FortiGuard) barram o endereço
`*.sslip.io` do Coolify. Por isso o Hangar também é publicado na Vercel (`*.vercel.app`), configurado
em `vercel.json`: sem build de framework, copia `dist/Hangar.html` para `public/index.html`, com os
mesmos cabeçalhos do nginx. O projeto Vercel fica ligado a este repositório e publica sozinho a cada
push na `main` (não precisa de Redeploy manual). Com um domínio próprio (ex.: `hangar.produtivajunior.com.br`)
o sslip deixa de ser necessário.

### Contagem de acessos (Vercel Web Analytics)

No endereço da Vercel o app carrega o script do Vercel Web Analytics (`/_vercel/insights/script.js`,
sem cookies) e conta cada tela como uma página: `/biblioteca`, `/escopos`, `/auxilios`, `/escopo/<id>`
(agrupado como `/escopo/[id]`) etc. A contagem automática fica desligada para o link direto não contar
a Home antes da tela aberta. Os números ficam no painel da Vercel → projeto `hangar-produtiva` → **Analytics**
(visitantes, visualizações, páginas mais vistas, origem, país e dispositivo). É preciso ligar uma vez em
**Analytics → Enable**; até isso, o script responde 404 e nada é contado.

Só os acessos pelo `*.vercel.app` entram. No Coolify e no arquivo local nada é carregado (lá não existe
`/_vercel/insights`). Com domínio próprio na Vercel, ajuste o teste de hostname em `iniciarContagem` (`src/app.js`).

Além das visitas, o app mede o **tempo em cada tela** (só com a aba visível). Como o plano grátis da Vercel
não tem eventos personalizados, o tempo vai como uma visita técnica: caminho `/_tempo/<tela>` e rota
`/_tempo/<faixa>` (3–10 s, 10–30 s, 30 s–1 min, 1–3 min, 3–10 min, 10–30 min, 30 min+). Menos de 3 s não é
enviado. No painel da própria Vercel essas linhas aparecem misturadas; a tela de monitoramento as separa.
Cada visita e cada medição contam um evento no limite de **50 mil eventos/mês** do plano Hobby (ao passar,
a Vercel pausa a contagem até o mês virar) e o histórico guardado é de **1 mês**.

### Tela de monitoramento (só administradores)

`https://hangar-produtiva.vercel.app/#/monitoramento` (sem link no menu). Pede a senha de administrador e mostra:
visitas, visitantes, telas por visitante e tempo médio, com comparação ao período anterior; visitas por dia
(ou por hora) e horário de uso (Brasília); telas mais vistas; tempo médio em cada tela e a distribuição das
durações; fichas de ferramentas, escopos e cases mais abertas (com o nome, não o id); aparelho, origem,
navegador, sistema e país; e quanto do limite de eventos do mês já foi usado. Períodos: 24 h, 7 e 30 dias.
Só conta produção (as prévias de branch ficam fora) e a própria tela de monitoramento não entra na conta.

Os números vêm da função `api/monitoramento.mjs` (Vercel Function), que consulta a API do Web Analytics.
Para ligar, em Vercel → projeto `hangar-produtiva` → **Settings → Environment Variables**, crie (Production):

- `HANGAR_ADMIN_SENHA`: a senha que a diretoria vai usar.
- `HANGAR_ANALYTICS_TOKEN`: um token criado em vercel.com/account/settings/tokens com escopo no time `pj`.
  Quando o token vencer, a tela avisa que ele foi recusado; é só criar outro e trocar o valor.

Depois de criar ou trocar as variáveis, faça um **Redeploy** do último deploy de produção. A senha fica só na
aba aberta (sessionStorage) e é conferida no servidor; senha errada espera ~1 s antes de responder.
`node tools/api-test.mjs` testa a função sem rede.

## Limitações conhecidas

| | |
|---|---|
| ✅ **React via unpkg.com** | **Resolvido.** O `dc-runtime` baixava React de CDN em runtime; sem internet a página renderizava o template cru, com `{{ item.nome }}` visível na tela. React 18.3.1 agora vai embutido no bundle, carregado antes do runtime. Verificado em Chromium com o unpkg inacessível. |
| 🔴 **`window.claude.complete`** | Só existe quando o Hangar roda dentro do Claude (claude.ai). No Coolify e no HTML baixado, **as funcionalidades de IA (Criar com IA, Modelo-padrão, Gerar documentação e Aplicar ferramenta) não funcionam**; o app avisa isso com clareza nos quatro pontos (inclusive "Gerar preenchida", corrigido em 2026-10-09) em vez de pedir para "tentar de novo". Exige backend. O "Modelo-padrão" só envia o nome do arquivo à IA, não o conteúdo do anexo, e a tela diz isso. |

Além disso: o que cada membro cadastra (ferramentas, documentação, modelos-padrão, cases, rascunhos) fica só no navegador dele até o CIEP publicar; não há login; e os anexos das ferramentas são links do Drive.

> Ruído esperado no console em `file://`: `dc-runtime.js:154` faz `fetch(location.href)` para
> recarregar o template (recurso de editor). É bloqueado por CORS, já tratado pelo `.catch()`
> do próprio runtime, e não afeta o funcionamento.

Detalhes e o resto do inventário no [DIAGNOSTICO.md](DIAGNOSTICO.md).

## Próximos passos

1. **Completar os 20 itens "Em construção"**: são as ferramentas sem PDF de metodologia no Drive
   (BMC, BPMN, SIPOC, RACI, Jornada, PCO, IBACO, FIB, MLQ, DCO, Gamificação, n8n…). O caminho mais curto é
   trazer as páginas do Hangar Academy com `tools/hangar-extrator.js` + `node tools/hangar-importar.mjs`
   (seção 2 de `fontes/README.md`) e regerar os rascunhos.
2. **Donos de área revisam a primeira carga**: as 27 ferramentas (2026-09-15) e os 15 escopos do PPGP 2026 (2026-09-24)
   foram aprovados pela conta institucional; cada dono confere os da sua área na próxima revisão (`node tools/revisao.mjs`).
3. **Pendências do PPGP 2026** com o CIEP: o significado dos itens marcados com ✱, o slide de Custeio e
   Precificação (que repete o de Gerenciamento Financeiro) e as etapas de Prosel. Ver `fontes/README.md`.
4. **Glossário**: o CIEP confirma os termos "a confirmar" em `src/data/trilha.json`.

Fora do escopo desta reconstrução e ainda abertos: backend para a IA, persistência, login e
o aviso de LGPD no campo "Insumos do projeto" (ver DIAGNOSTICO.md §9 e §11).
