# Diagnóstico — Biblioteca CIEP

Análise do MVP `Biblioteca CIEP.html` (356.672 bytes, sha256 `fedef82c…`), preservado
em `original/Biblioteca_CIEP.html`. Corresponde ao arquivo que está no Drive da
Produtiva Júnior em **MVP NOVO SISTEMA DE CIEP**, dono `brenocolt@produtivajunior.com.br`,
modificado em 21/06/2026.

---

## 1. Tecnologia

Não é um projeto Node/npm. Não há `package.json`, build, bundler ou dependência instalável.
São três camadas empacotadas num único HTML:

| Camada | O que é |
|---|---|
| Invólucro | Loader "bundler" da Claude.ai. Decodifica assets base64/gzip para Blob URLs e injeta o app via `DOMParser` + `replaceWith` |
| Runtime | `dc-runtime` — runtime proprietário da Anthropic (`// GENERATED from dc-runtime/src/*.ts — do not edit`). Carrega React 18.3.1 UMD de CDN |
| Aplicação | O app em si: marcação `<x-dc>` + uma classe `Component extends DCLogic` |

A sintaxe do template **não é HTML padrão nem JSX**:

```html
<sc-if value="{{ isHome }}">
<sc-for list="{{ filtered }}" as="item">
<button onclick="{{ item.open }}" style-hover="background:#2E9FB8">
```

`<sc-if>`, `<sc-for>`, `style-hover` e `style-focus` só existem dentro do `dc-runtime`.

## 2. Arquivo principal

Um arquivo só, com duas camadas:

- **Distribuível:** `Biblioteca_CIEP.html`
- **Fonte real:** a string JSON escapada dentro de `<script type="__bundler/template">`

Editar o HTML direto quebra o bundle. Use `tools/unpack.mjs` e `tools/pack.mjs`.

## 3. Como executar

Abrir o HTML no navegador. Sem servidor, sem `npm install`, sem build.

**Duas ressalvas que quebram o uso real** — ver seções 8 e 9.

## 4. Onde ficam os dados

Originalmente **hardcoded em JavaScript**, em memória. Extraídos nesta migração para
`src/data/` (ver `README.md`):

| Estrutura | Conteúdo |
|---|---|
| `ferramentas.json` | 13 ferramentas, ~15 campos cada |
| `problemas.json` | 11 problemas → IDs de ferramenta (tela "Recomendar") |
| `modelos.json` | 1 modelo-padrão (Business Model Canvas, 9 blocos) |
| `documento-padrao.json` | Documento PMMC (7 seções, 9 blocos) |

**Nada é persistido.** Sem `localStorage`, `sessionStorage`, `IndexedDB` ou cookies.
O que o usuário cadastra vive em `state.extra` e **desaparece no F5**.

## 5. Banco de dados e autenticação

**Nenhum dos dois.** Sem backend, sem `fetch()`, sem API. A única chamada de rede da
aplicação é `window.claude.complete`. Sem login, sem sessão, sem controle de acesso —
o avatar "CV" no cabeçalho é uma `<div>` com texto fixo.

## 6. Funcionalidades apenas demonstrativas

### 🔴 Grave — parece funcionar, mas não funciona

**"Cadastrar modelo-padrão a partir do anexo"** (`readModelo`)

A tela afirma *"Modelo-padrão lido e registrado"*. **O arquivo nunca é lido.**

```js
onModeloFile(e) {
  const file = e.target.files[0];
  this.setState({ modeloFile: { name: file.name, type: file.type, size: file.size } });
  //             ↑ só metadados. Sem FileReader, sem arrayBuffer.
}
```

O prompt enviado à IA contém apenas o **nome do arquivo**. A IA **inventa** os blocos.
Com um modelo proprietário da Produtiva, ela vai alucinar — e a UI vai afirmar que leu o anexo.
Pior: esse formato falso vira o padrão que a IA seguirá em todos os preenchimentos futuros
daquela ferramenta.

O modelo já cadastrado em `modelos.json` diz `fonte: '[CIEP] Modelo - BMC.pdf'` e
`registrado: 'Lido do anexo'` — mas está hardcoded. Nenhum PDF foi lido.

### 🟠 Botões decorativos (sem `onclick`)

- **"Baixar"** nos anexos da ficha
- **"Baixar"** no modal de anexos
- **"Salvar rascunho"** no cadastro manual

Os anexos são **apenas metadados** (nome, tipo, versão, data). Nenhum arquivo existe.

### 🟠 Ações que só mostram toast

```js
exportDoc(fmt) { this.showToast('Documento exportado (' + fmt + ')…'); }
exportApply:() => this.showToast('Ferramenta preenchida exportada…')
```

### 🟠 Avaliação e feedback

👍/👎 e o textarea só chamam `setState`. Não vão a lugar nenhum — e `openContent()`
**reseta `rating` e `feedback`**, então o feedback se perde na navegação.

### 🟡 Números fictícios

`acessos: 312`, `nota: '4.8'` — estáticos, nunca incrementam. "Mais acessados" ordena por
um número inventado. "Novidades" é `data.slice(0,3)` — ordem do array, não por data.

### 🟡 Código morto / UI inalcançável

- `state.filters.responsavel` existe, mas `buildFilterGroups()` não cria esse grupo
- `setDocType()` e `addBloco()` não são expostos em `renderVals()`
- `docIsModelo` hardcoded `false` e `docIsSectioned` hardcoded `true` → todo o ramo
  "modelo editável" do `generateDoc()`, mais `blocosEdit`/`blocosPrev`, é inalcançável
- Categoria "Financeiro" está nos filtros, mas nenhuma ferramenta a usa
- O wizard de cadastro (1 → 2 → 3) é estático: passo 1 sempre ativo, sem navegação

### ✅ O que funciona

Busca textual, filtros multi-critério com contadores, 3 modos de card, navegação entre
6 telas, acordeões da ficha, modal de anexos, recomendador por problema, cadastro manual
(em memória), editor de documentação — e as 4 chamadas de IA **quando dentro da Claude.ai**.

## 7. Integrações externas

| Integração | Situação |
|---|---|
| **unpkg.com** (React, ReactDOM, Babel) | 🔴 Obrigatório em runtime — ver seção 8 |
| **`window.claude.complete`** | 🔴 Só existe no sandbox de artifacts da Claude.ai |
| **Google Fonts** (`preconnect`) | 🟢 Vestigial — as fontes já estão embutidas como WOFF2 |

**Nenhuma outra.** Sem Supabase, Firebase, analytics, Sentry, Drive, Notion.

### Credenciais e variáveis de ambiente

✅ **Varredura limpa.** Zero ocorrências de `sk-`, `api_key`, `Bearer`, `Authorization`,
`client_secret`, `AKIA…`, `ghp_`, `xox[baprs]-`, `process.env`, `import.meta.env`,
`VITE_`, `NEXT_PUBLIC_` ou strings de conexão.

Esperado: o `window.claude.complete` é autenticado pelo *host*, então nunca houve chave no
código. É por isso que ele não é portável — fora do ambiente original não se "aponta para
outro lugar", é preciso construir a autenticação do zero.

## 8. 🔴 A aplicação não funciona offline — verificado

O `dc-runtime` baixa React de CDN em tempo de execução:

```
https://unpkg.com/react@18.3.1/umd/react.production.min.js
https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js
```

Testado em Chromium com o unpkg inacessível. Resultado, **idêntico no bundle original**:

```
[dc] failed to load React or boot: Error: failed to load https://unpkg.com/react@18.3.1/...
```

A página não fica em branco — fica **pior**: renderiza o template cru, com
`{{ item.nome }}` e `{{ n.label }}` visíveis na tela.

Num cliente com firewall corporativo, ou sem internet, é isso que o consultor vê.

## 9. 🔴 A IA já está quebrada no uso real

O Drive contém, ao lado do HTML, um documento **INSTRUÇÃO** cujo conteúdo integral é:

> *"PARA ABRIR O ARQUIVO .html DEVE BAIXAR, APÓS ISSO CLICAR COM O BOTÃO DIREITO E IR EM
> ABRIR COM E ESCOLHER SEU NAVEGADOR (NORMALMENTE GOOGLE CHROME)"*

O método de distribuição oficial é **baixar e abrir no Chrome** — exatamente o cenário em
que `window.claude.complete` não existe. **Hoje, todo consultor que segue a INSTRUÇÃO tem
as 4 funcionalidades de IA falhando em 100% das tentativas**, recebendo *"Não consegui gerar
agora. Tente refinar a descrição"* — mensagem que joga a culpa nele.

As 4 chamadas: `generateApply()`, `generateDoc()`, `generateTool()`, `readModelo()`.

## 10. O conteúdo não vem do Hangar Academy

### Divergência confirmada no PMMC

O `[CIEP] Process Map Model Canvas.pdf` oficial tem **10 blocos**. O documento embutido no
MVP tem **7**. Faltam:

- **Indicadores de Performance**
- **Ferramentas de Controle**
- **Finalidade e Melhorias**

Um consultor que use o app entrega ao cliente um PMMC **sem indicadores, sem controles e
sem finalidade/melhorias** — os blocos que sustentam diagnóstico e acompanhamento.

### Só 2 das 13 ferramentas têm lastro no acervo CIEP

| | |
|---|---|
| **No app, sem lastro** | BPMN, 5 Porquês, GUT, Esforço×Impacto, Ishikawa, Stakeholders, Roteiro de Entrevista, Value Prop, 5W2H, Escopo, Kickoff — **11 de 13** |
| **No acervo, ausentes do app** | Mapa de Contexto, 5 Forças de Porter, Mapa Perceptual, Matriz Francisco Gracioso, Matriz Comparativo de Marcas, Teoria da Saliência, CPV, Estudo de Segmento, Proposta de Valor, SWOT Quantitativa, BMC Financeiro |
| **Interseção** | SWOT e BMC |

Os responsáveis exibidos — *"Lucas Moreira"*, *"Marina Costa"*, *"Rafael Tonon"* — são
fictícios. Os donos reais do acervo são `carloseduardo@`, `gabrielapalma@`,
`viniciusmoraes@`, `laurarodrigues@`, `heitorqueiroz@`, `thiagomelo@`.

### A taxonomia do Hangar não cabe no modelo do MVP

O Hangar organiza **~29 ferramentas + 6 escopos com ~34 etapas**, em dois eixos:

**Ferramentas** → Metodologias · Entendimento · Pesquisas de cultura · Processos · Sistema PJ
**Escopos** → Sistemas e Automação · Mapeamento e Modelagem · Pesquisa de Mercado ·
Plano de Marketing · Gerenciamento Financeiro · Produto de Implementação

O MVP trata **Escopo como um tipo de conteúdo** — um item plano na lista, ao lado de
"Ferramenta" e "Checklist". No Hangar, Escopo é a **linha de serviço**, com etapas em
sequência, e as ferramentas são usadas *dentro* das etapas. É uma relação muitos-para-muitos
que a lista plana não representa.

E o filtro `etapa` do MVP — *Diagnóstico, Coleta, Análise, Planejamento, Execução,
Validação, Entrega Final* — é **vocabulário inventado**. As etapas reais são específicas de
cada escopo ("Estabilização", "Testes e Homologação", "Definição dos Canais"). Um consultor
de Gerenciamento Financeiro não reconhece nenhum dos 7 termos.

### Cobertura do Drive é parcial

O acervo **não** está todo no Drive. Verificado por busca:

| Cluster | Par `Metodologia + Modelo Padrão` no Drive? |
|---|---|
| Marketing/Pesquisa — Porter, Mapa Perceptual, Gracioso, Saliência, Comparativo de Marcas, CPV, SWOT | ✅ completo |
| CIEP — PMMC, Mapa de Contexto, Estudo de Segmento, Proposta de Valor, BMC | ✅ |
| Processos — SIPOC | 🟡 PDF avulso, sem modelo |
| Processos — Matriz RACI, Cadeia de Valor, Jornada do Cliente | 🔴 só aplicações em cliente |
| Cultura — PCO | 🟡 Google Forms + respostas |
| Cultura — FIB, IBACO, MLQ6-S | 🔴 nada |
| Gamificação, DCO | 🟡 só decks do PTPJ |
| Sistema PJ — BPMN, Analisador de Entrevistas, Agente de IA Interno | 🔴 nada |

Boa parte do conhecimento está escrita **dentro das páginas do Google Sites** e não existe
como arquivo. Migrar exige exportar o Hangar.

## 11. Riscos ao modificar

### Estruturais

1. **Git era inútil no formato original** — 98% do conteúdo em 2 linhas. Todo diff aparecia
   como "1 linha alterada" de 178 mil caracteres. *(Resolvido pela Fase 1.)*
2. **Edição direta corrompe o bundle** — a linha do template é uma string JSON escapada.
   *(Resolvido: use `tools/pack.mjs`.)*
3. **Runtime proprietário e não-versionado** — `dc-runtime` sem código-fonte, sem versão,
   sem documentação, e o arquivo proíbe edição. Continuar sobre essa base é lock-in.
4. **Zero rede de segurança** — sem testes, sem tipos, sem lint.
5. **Estilo 100% inline** — ~1000 atributos `style="…"`, nenhuma classe CSS. Mudar a cor da
   marca é find/replace de hex em 170 KB.

### Operacionais e de conformidade

6. **Perda total de dados** — tudo desaparece no refresh.
7. **LGPD — risco real e não mitigado.** O campo *"Insumos do projeto"* convida o consultor a
   colar contexto de cliente real (nomes, números, dados financeiros). Esse texto vai
   integralmente para a API da Anthropic. **Não há aviso de privacidade, consentimento,
   anonimização ou registro.** Para uma consultoria que assina NDA, isso precisa ser tratado
   antes de qualquer distribuição interna.
8. **Alucinação apresentada como leitura** — ver seção 6.
9. **Falha invisível** — mensagens genéricas fazem falha de infraestrutura parecer erro do usuário.

---

## Resumo

O MVP é uma **boa maquete de interface** — a modelagem de `anexos` (`PDF explicativo` /
`Template editável`) e de `modelos_padrao` corresponde exatamente ao padrão real do acervo
da Produtiva. Quem o desenhou acertou o formato.

O que não se sustenta é o resto: o conteúdo é consultoria genérica em vez do conhecimento
do Hangar, a taxonomia é plana onde a real tem dois eixos, nada persiste, não há acesso
controlado, e as duas dependências externas (unpkg e `window.claude.complete`) estão ambas
quebradas no modo como o arquivo é distribuído hoje.
