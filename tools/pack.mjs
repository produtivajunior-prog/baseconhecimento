#!/usr/bin/env node
/**
 * pack.mjs — remonta o bundle distribuível a partir das fontes em src/, assets/ e vendor/.
 *
 * Inverso de tools/unpack.mjs. O arquivo gerado em dist/ é o que se entrega ao consultor:
 * um HTML único, que abre com duplo clique, sem servidor e sem instalação.
 *
 *   node tools/pack.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist/Biblioteca_CIEP.html');
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
const dados = (nome) => JSON.parse(readFileSync(join(ROOT, `src/data/${nome}.json`), 'utf8'));

const DADOS = {
  ferramentas: dados('ferramentas'),
  problemas: dados('problemas'),
  modelos: dados('modelos'),
  documentoPadrao: dados('documento-padrao'),
};

// `evalDcLogic` do dc-runtime envolve a fonte inteira num `new Function`, então o
// const abaixo fica no mesmo escopo da classe que o consome.
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

console.log(`dist/Biblioteca_CIEP.html  ${html.length} bytes  (${assets.length} assets)`);
