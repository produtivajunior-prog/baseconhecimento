# Biblioteca CIEP — Produtiva Júnior

Biblioteca interna de ferramentas, metodologias e escopos de consultoria, para uso dos
consultores de projeto.

> **Estado atual:** MVP herdado, desempacotado para desenvolvimento. Ainda **não** é a
> versão que deve ir para os consultores — leia o [DIAGNOSTICO.md](DIAGNOSTICO.md) antes
> de mexer, especialmente as seções 8, 9 e 10.

---

## Estrutura

```
original/          bundle herdado, intacto — linha de base, não editar
src/
  index.html       marcação da interface (sintaxe <sc-if> / <sc-for> do dc-runtime)
  app.js           lógica: class Component extends DCLogic
  tail.html        fechamento do documento
  data/            o acervo, como dado editável
    ferramentas.json        13 ferramentas
    problemas.json          11 problemas → ferramentas (tela "Recomendar")
    modelos.json            modelos-padrão (blocos que a IA preenche)
    documento-padrao.json   documento PMMC
assets/            logo e fontes; index.json mapeia uuid ↔ arquivo
vendor/            dc-runtime.js e o invólucro do bundle
tools/             unpack / pack / verify
dist/              artefato gerado — não editar à mão
```

## Fluxo de trabalho

O distribuível é um HTML único que abre com duplo clique, sem servidor e sem instalação.
Ele é **gerado**, nunca editado direto.

```bash
node tools/pack.mjs      # src/ + data/ + assets/ → dist/Biblioteca_CIEP.html
node tools/verify.mjs    # confere que dist/ preserva o conteúdo do original
node tools/unpack.mjs    # só para reimportar um bundle de fora
```

**Para mudar conteúdo** (texto de uma ferramenta, passos, anexos): edite
`src/data/*.json` e rode `pack`. Não precisa tocar em código.

**Para mudar comportamento ou layout:** `src/app.js` e `src/index.html`.

⚠️ Editar `dist/` ou `original/` à mão corrompe o bundle — o template é uma string JSON
escapada dentro do HTML.

### O que o verify garante

`tools/verify.mjs` compara `dist/` com `original/` em três níveis:

- **assets** — bytes idênticos após descomprimir
- **markup** — a marcação `<x-dc>` idêntica caractere a caractere
- **dados** — avalia a classe dos dois bundles com `new Function` (do mesmo jeito que o
  `dc-runtime` faz) e compara as estruturas resultantes; depois confere que os JSON em
  `src/data/` são fiéis ao que o bundle original continha

Comparação byte a byte do arquivo inteiro não serve: o gzip do Node não reproduz os bytes
do compressor original, e os dados saíram do código para JSON. O que precisa bater é o que
o navegador enxerga.

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

Ver [DIAGNOSTICO.md](DIAGNOSTICO.md) seção 10 — o conteúdo precisa ser reconstruído a partir
do **Hangar Academy**, e a taxonomia de dois eixos (Ferramentas × Escopos/Etapas) não cabe
no modelo plano atual.
