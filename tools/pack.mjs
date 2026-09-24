#!/usr/bin/env node
/**
 * pack.mjs — remonta o bundle distribuível a partir das fontes em src/, assets/ e vendor/.
 *
 * Inverso de tools/unpack.mjs. O arquivo gerado em dist/ é o que se entrega ao consultor:
 * um HTML único, que abre com duplo clique, sem servidor e sem instalação.
 *
 *   node tools/pack.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// --com-rascunhos: bundle de PRÉ-VISUALIZAÇÃO com os rascunhos de src/data/rascunhos/ (status "Em revisão"),
// gravado em outro arquivo. O distribuível de verdade só leva conteúdo promovido.
const PREVIEW = process.argv.includes('--com-rascunhos');
const OUT = join(ROOT, PREVIEW ? 'dist/Hangar.preview.html' : 'dist/Hangar.html');
const SCRIPT_OPEN = '<script type="text/x-dc" data-dc-script="">';

const { assets, extResources } = JSON.parse(readFileSync(join(ROOT, 'assets/index.json'), 'utf8'));

// ---------------------------------------------------------------- manifest
const manifest = {};
for (const a of assets) {
  const raw = readFileSync(join(ROOT, a.path));
  const packed = a.compressed ? gzipSync(raw, { level: 9 }) : raw;
  manifest[a.uuid] = { mime: a.mime, compressed: a.compressed, data: packed.toString('base64') };
}

// ---------------------------------------------------------------- dados
// O acervo vive em src/data/*.json para poder ser revisado e versionado como dado,
// não como código. Aqui ele volta para dentro do bundle: o distribuível continua
// sendo um arquivo único, que abre em file:// sem servidor e sem fetch.
// src/data/rascunhos/ NUNCA entra aqui: só conteúdo promovido (tools/promover.mjs).
const dados = (nome) => JSON.parse(readFileSync(join(ROOT, `src/data/${nome}.json`), 'utf8'));

const DADOS = {
  taxonomia: dados('taxonomia'),
  ferramentas: dados('ferramentas'),
  escopos: dados('escopos'),
  problemas: dados('problemas'),
  modelos: dados('modelos'),
  documentoPadrao: dados('documento-padrao'),
  cases: dados('cases'),
  trilha: dados('trilha'),
  produtiva: dados('produtiva'),
};

// `evalDcLogic` do dc-runtime envolve a fonte inteira num `new Function`, então o
// const abaixo fica no mesmo escopo da classe que o consome.
if (PREVIEW) {
  const dir = join(ROOT, 'src/data/rascunhos');
  const rascunhos = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8'))) : [];
  const casos = rascunhos.filter((r) => r.cliente !== undefined);
  const ferr = rascunhos.filter((r) => !r.id.startsWith('escopo-') && r.etapas === undefined && r.cliente === undefined);
  const esc = rascunhos.filter((r) => r.etapas !== undefined);
  const emRevisao = (r) => ({ ...r, status: r.status === 'Em construção' ? r.status : 'Em revisão' });
  // rascunho substitui o item promovido de mesmo id; os legados do MVP saem da prévia
  DADOS.ferramentas = DADOS.ferramentas.filter((f) => f.revisao && !ferr.some((r) => r.id === f.id)).concat(ferr.map(emRevisao));
  DADOS.escopos = DADOS.escopos.filter((e) => !esc.some((r) => r.id === e.id)).concat(esc);
  for (const r of ferr) if (r.modelo) DADOS.modelos = DADOS.modelos.filter((m) => m.id !== r.modelo.id).concat([r.modelo]);
  DADOS.modelos = DADOS.modelos.filter((m) => m.toolId === null || DADOS.ferramentas.some((f) => f.id === m.toolId));
  DADOS.problemas = DADOS.problemas.map((p) => ({ ...p, ids: p.ids.filter((id) => DADOS.ferramentas.some((f) => f.id === id)) })).filter((p) => p.ids.length);
  DADOS.cases = DADOS.cases.filter((c) => !casos.some((r) => r.id === c.id)).concat(casos);
  console.log(`prévia: ${ferr.length} ferramenta(s), ${esc.length} escopo(s) e ${casos.length} case(s) em rascunho`);
}

const preludio =
  '// GERADO por tools/pack.mjs a partir de src/data/*.json — não edite aqui.\n' +
  `const DADOS = ${JSON.stringify(DADOS)};\n\n`;

// ---------------------------------------------------------------- template
// A ordem importa: a marcação precisa vir antes do script, porque o dc-runtime lê
// <x-dc> como template e só depois avalia a classe que o alimenta.
const template =
  readFileSync(join(ROOT, 'src/index.html'), 'utf8') +
  SCRIPT_OPEN + '\n' +
  preludio +
  readFileSync(join(ROOT, 'src/app.js'), 'utf8') +
  '</script>' +
  readFileSync(join(ROOT, 'src/tail.html'), 'utf8');

/**
 * Serializa para JSON escapando `</` como `</`.
 *
 * Sem isso o parser de HTML encontra o `</script>` que existe DENTRO do template
 * (o bloco data-dc-script) e fecha a tag `__bundler/template` cedo demais,
 * truncando o bundle. O arquivo original faz exatamente o mesmo escape.
 */
const embedJson = (value) => JSON.stringify(value).split('</').join('<\\u002F');

const html =
  readFileSync(join(ROOT, 'vendor/bundle-shell.html'), 'utf8') +
  '<script type="__bundler/manifest">\n' + embedJson(manifest) + '\n  </script>\n\n  ' +
  '<script type="__bundler/ext_resources">\n' + embedJson(extResources) + '\n  </script>\n\n  ' +
  '<script type="__bundler/template">\n' + embedJson(template) + '\n  </script>\n' +
  '</body>\n</html>\n';

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(OUT, html);

console.log(`${OUT.slice(ROOT.length + 1)}  ${html.length} bytes  (${assets.length} assets)`);
