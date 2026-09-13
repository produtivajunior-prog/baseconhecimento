# fontes/ — de onde vem cada texto da Biblioteca

Tudo que está em `src/data/ferramentas.json` e `src/data/escopos.json` precisa apontar para um
arquivo desta pasta. É a trilha que permite conferir, atualizar e responder "quem disse isso?".

```
fontes/
  README.md            este arquivo
  inventario.json      gerado por tools/rascunho.mjs --inventario: um registro por arquivo extraído
  drive/<id>.txt       texto bruto de um arquivo do Google Drive, com cabeçalho
  hangar/<slug>.md     texto colado à mão de uma página do Hangar Academy (Google Sites)
```

## 1. Extrair do Drive

Não há chave de API no repositório e não deve haver. A extração é feita numa sessão do
Claude Code com o conector do Google Drive ligado, lendo cada arquivo do inventário abaixo e
gravando o texto em `fontes/drive/<id>.txt` com este cabeçalho:

```
# id: 16uPvXjSdmn7cvs0udVo13O4xq8cVgpQr
# nome: [CIEP] Metodologia - PMMC.pdf
# mimeType: application/pdf
# dono: carloseduardo@produtivajunior.com.br
# url: https://drive.google.com/file/d/16uPvXjSdmn7cvs0udVo13O4xq8cVgpQr/view
# extraidoEm: 2026-09-07
# uso: ferramenta:pmmc
---
<texto integral, sem resumo>
```

`uso` é `ferramenta:<id>`, `escopo` ou `modelo:<id>`. Planilhas viram texto tabulado.
Para reextrair, gere de novo e compare o `sha256` no `inventario.json`: se mudou, o rascunho
daquela ferramenta precisa ser refeito.

### Arquivos-fonte por ferramenta

| Ferramenta | Metodologia | Modelo padrão / planilha | Dono |
|---|---|---|---|
| PMMC | `16uPvXjSdmn7cvs0udVo13O4xq8cVgpQr` | `1sfzv1hNxzuRhD0NDe9ekpxfNE2EDsqOB` | carloseduardo@ |
| Mapa de Contexto | `1I8J5SrhpVpjwO-jPKVqhQAx7KN6cI6gm` | `161BO5wQ10MHub_X-9ngOWOKkG1pd3ga1` | carloseduardo@ |
| SWOT | `1S9KfYVHM3LDkz8DJLvsn1SJ76GwjX4R8` | `1-Y_mYRGz1ZxiVVAK1_WyMlZFYjUBjGf7`, `1xSiqIc7gthAaUHSa3RBs1_BMoqQMZRAWU7zQg-xBWUw` | gabrielapalma@ |
| 5 Forças de Porter | `1_GkfmjPhdLa2lZl9lH3e5izPDvRJpe1h` | `19FF6AvSQ5YzYieFjahDTW5ShIX9h3qCq`, `1qAOzFsggrbdFxKPkart9UxX7YacHL1AnvCSMKTJLwOY` | gabrielapalma@ / heitorqueiroz@ |
| Mapa Perceptual | `1MCmr8yQSTcVSmXgROEYG9raa1LsobC9K` | `1_J4FiNtmhCg4JbRKm8LFZ3jdBhUT2EBg` | viniciusmoraes@ |
| Matriz Francisco Gracioso | `1Qpmkh9Nc6RqzhLYeIIiGAnNG0j7ZfzWD` | `1HBZuE3NRRU8BOjyUiuxARs65tqoxf58W` | viniciusmoraes@ |
| Comparativo de Marcas | `1buWpAxUMmWGr7YSVrCZ2hrp5NsLbdJIN` | `1XDvv1MjcPEocNOzk0hgttg7lSmZhnWax` | viniciusmoraes@ |
| Teoria da Saliência | `1hqTVeBQ_cOFYadqaEkSY39Bma-KjSwWH` | `1sjp_K3sv-IFSORfI7IbqAd7PUGY1aQ2c` | viniciusmoraes@ |
| CPV / Proposta de Valor | `1-gwzQtODVAKuVg9NotuP6UMyYs7Mzexb` | `1QK6lIIWR589W8HG0xWhknAENBw8cwwYD` | laurarodrigues@ |
| Estudo de Segmento | — | checklist `1KcKyCTQceifhm4btNwmzvW43BEFbQ-Kh` | carloseduardo@ |
| Banco de Indicadores | — | planilha `1bvEJGCUH_P8-vDykANXbYY-MMpdFt7d8j6TBDM7Kb2A` | — |

### Arquivos-fonte dos escopos

| Arquivo | Id | Dono |
|---|---|---|
| Resumão dos escopos (macroetapas por escopo) | `1z773_kmhKUBwtE8kD4EdJIooz4_IgVDe9Vp0Ju0_9L0` | thiagomelo@ |
| Checklist Escopos (ativos × despriorizados) | `1jeY1obf5wl2w_LRxfKQhU3mnuj6V6_MJZ8XfV4hXTGE` | thiagomelo@ |
| Cronograma Base — Plano de Marketing | `10VQNiyCgZbuoCLCCoUphE6AM_9Ntg_y-4sprsaopLeQ` | thiagomelo@ |
| Cronograma Base — Mapeamento e modelagem | `13K7E64nP_ReIf-u6WIQ0RUHRwvYxiTGwjYI3Hbxz8TE` | thiagomelo@ |
| Cronograma Base — Gerenciamento financeiro | `1e3Ek0lTrjCMfpRikeOK8pyhVwDvFVbLwf3CfSX2iPJo` | thiagomelo@ |
| Cronograma Base — Pesquisa de Mercado | `1zJV0aRDaxQNZfvHg1C_ABxY4u7TrMF5M-ErMRsHx-30` | thiagomelo@ |
| Cronograma Base — Planejamento estratégico | `1LGez_RtiWpZTHnEmXpETG_xgtiU6TL4nN4CpeXU2vEE` | thiagomelo@ |
| Cronograma Base — Estruturação Comercial | `1HeM7YZv0vgQCTkn6ZOzS11h9jELTGUqkmtaITIOEp10` | thiagomelo@ |
| Cronograma Base — Cultura e Gamificação | `1MzokqJJ0_00xWPRIxRAuoSD_OEo3VAgAcx1sb05kqP4` | thiagomelo@ |
| Cronograma Base — Custeio e Precificação | `1LIe3FcON0dRXcErSfzRFVg-aZTcPUlbe0S2UAf-Unbw` | thiagomelo@ |

### Sem metodologia no Drive (só aplicação em cliente ou deck de treinamento)

SIPOC, Matriz RACI, Cadeia de Valor, Jornada do Cliente, BMC, PCO, FIB, IBACO, MLQ, DCO,
Gamificação, BPMN. Entram na Biblioteca como **"Em construção"**, com `pendencias[]` dizendo
o que falta e para quem pedir. O texto dessas páginas existe só no Hangar (seção 2).

## 2. Colar do Hangar Academy

O Hangar é um Google Sites (`https://sites.google.com/d/1kvmzQjCYMKkmhyunRMIceHjHQHyaSTyL/edit`,
dono heitorqueiroz@). Não há exportação e o site não responde a leitura por rede a partir da
sessão de desenvolvimento. Antes de colar, vale retestar: se a URL publicada responder `200`
sem redirecionar para login (`curl -sI <url>`), a página pode ser lida direto.

Enquanto isso, cada página vira um arquivo `fontes/hangar/<slug>.md`, colado por quem tem
acesso, neste formato:

```markdown
---
url: https://sites.google.com/...
titulo: Business Model Canvas
coladoPor: heitorqueiroz@produtivajunior.com.br
data: 2026-09-10
---

## O que é
...

## Quando usar
...

## Passo a passo
1. ...

## Casos reais
- BMC - Picuí Pizzas (link do Drive)

## Template padrão
- link do Drive
```

Os títulos `##` acima são os que `tools/rascunho.mjs` reconhece. Texto fora deles vai para
`pendencias` do rascunho, não é descartado.

## 3. Gerar rascunho

```bash
node tools/rascunho.mjs --inventario          # atualiza fontes/inventario.json (hash, uso, dono)
node tools/rascunho.mjs pmmc                  # fontes/drive + fontes/hangar → src/data/rascunhos/pmmc.json
node tools/rascunho.mjs --escopos             # Resumão + Checklist + cronogramas → rascunhos/escopo-*.json
```

O rascunho tem os mesmos campos de `ferramentas.json` mais:

- `origem` — para cada campo, de onde veio (`drive:<id>#<seção>`, `hangar:<slug>#<seção>`, `manual:<email>`);
- `pendencias[]` — campos que o parser não encontrou. **Campo não encontrado fica `null`; nunca é inventado**;
- `revisao` — `{ "status": "rascunho", "revisor": null, "data": null }`.

Onde o parser não resolver, preencha o JSON à mão e marque `origem[campo] = "manual:<seu e-mail>"`.

## 4. Revisar

Quem revisa é o dono da área (tabela acima). Checklist:

- [ ] nome é o nome oficial da ferramenta no acervo
- [ ] `descricao` e `objetivo` são fiéis ao PDF, não reescritos
- [ ] `passos` estão na ordem do documento
- [ ] `perguntas` estão verbatim
- [ ] cada anexo aponta para o arquivo certo do Drive (`url` abre)
- [ ] `responsavel` tem e-mail real
- [ ] nenhum campo `null` sem entrada correspondente em `pendencias`
- [ ] `categoria` é um dos 5 grupos do Hangar

Ao aprovar, preencha `revisao: { "status": "aprovado", "revisor": "<e-mail>", "data": "YYYY-MM-DD" }`.
Se o dono não responder, gabrielapalma@ (dona da pasta CIEP) aprova.

## 5. Promover

```bash
node tools/promover.mjs pmmc        # exige revisao.status == "aprovado"
node tools/pack.mjs && node tools/verify.mjs
```

`promover` faz o merge por `id` em `ferramentas.json` ou `escopos.json`, ordena e apaga o
rascunho. `pack` nunca lê `src/data/rascunhos/`, então o bundle só contém conteúdo aprovado.
Para um bundle de pré-visualização com os rascunhos, use `node tools/pack.mjs --com-rascunhos`
(os itens entram com status "Em revisão" e o arquivo vai para `dist/Hangar.preview.html`).

## 6. Cases de projeto

Cases não passam por extração nem por revisão: quem viveu o projeto registra, o CIEP publica.

**Quem cadastra (qualquer membro):**
1. Suba os documentos e o vídeo da equipe numa pasta do Drive `Banco de Cases/<cliente>` com
   acesso "qualquer pessoa da Produtiva" e copie os links. Vídeo pode ser Drive ou YouTube
   (não listado).
2. No Hangar, aba **Cases → Cadastrar case**: projeto, equipe (1 gerente + 2 consultores), história,
   ferramentas usadas, documentos (link) e vídeo (link). **Publicar no meu Hangar** salva no seu
   navegador; **Baixar case (.json)** gera o arquivo.
3. Envie o `.json` ao CIEP. Não inclua números sensíveis do cliente (faturamento, margem, nomes de
   funcionários): o case é visto por toda a Produtiva.

**Quem publica (CIEP):**
```bash
node tools/promover.mjs --cases-dir ~/Downloads/cases   # todos os .json da pasta → src/data/cases.json
node tools/pack.mjs && node tools/verify.mjs             # verify checa equipe, links https, escopo e ferramentas
```
O case aparece para todos na próxima versão do `dist/Hangar.html`. Quando houver backend, o mesmo
JSON passa a ser gravado direto; ficha e busca não mudam.
