#!/usr/bin/env node
/**
 * unpack.mjs — explode o bundle self-extracting da Biblioteca CIEP em fontes legíveis.
 *
 * O HTML original guarda ~98% do conteúdo em duas linhas gigantes:
 *   <script type="__bundler/manifest">  → assets em base64 (alguns gzipados)
 *   <script type="__bundler/template">  → o app inteiro, como string JSON escapada
 *
 * Este script separa tudo em arquivos versionáveis. O caminho de volta é tools/pack.mjs.
 *
 *   node tools/unpack.mjs [original/Biblioteca_CIEP.html]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || join(ROOT, 'original/Biblioteca_CIEP.html');

// Extensão por mime — usada só para nomear o arquivo em disco.
const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'font/woff2': 'woff2',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'text/css': 'css',
};

/** Lê o conteúdo de um <script type="..."> do bundle. */
function readScriptTag(html, type) {
  const open = `<script type="${type}">`;
  const a = html.indexOf(open);
  if (a === -1) throw new Error(`bloco ausente no bundle: ${type}`);
  const b = html.indexOf('</script>', a);
  return html.slice(a + open.length, b).trim();
}

const html = readFileSync(SRC, 'utf8');

const manifest = JSON.parse(readScriptTag(html, '__bundler/manifest'));
const template = JSON.parse(readScriptTag(html, '__bundler/template'));
const extResources = JSON.parse(readScriptTag(html, '__bundler/ext_resources'));

// O invólucro (loader + <style> + thumbnail SVG) é reaproveitado na volta sem alteração.
const shellEnd = html.indexOf('<script type="__bundler/manifest">');
writeFileSync(join(ROOT, 'vendor/bundle-shell.html'), html.slice(0, shellEnd));

// ---------------------------------------------------------------- assets
mkdirSync(join(ROOT, 'assets/fonts'), { recursive: true });
mkdirSync(join(ROOT, 'vendor'), { recursive: true });

// Nomes estáveis para os UUIDs, para que o diff faça sentido em vez de mostrar hashes.
const FRIENDLY = {
  'image/png': 'assets/logo.png',
  'text/javascript': 'vendor/dc-runtime.js',
};
let fontN = 0;

const assetIndex = [];
for (const [uuid, entry] of Object.entries(manifest)) {
  let bytes = Buffer.from(entry.data, 'base64');
  if (entry.compressed) bytes = gunzipSync(bytes);

  let path = FRIENDLY[entry.mime];
  if (!path) {
    const ext = EXT[entry.mime] || 'bin';
    path = entry.mime === 'font/woff2'
      ? `assets/fonts/font-${++fontN}.${ext}`
      : `assets/asset-${uuid.slice(0, 8)}.${ext}`;
  }

  writeFileSync(join(ROOT, path), bytes);
  assetIndex.push({ uuid, path, mime: entry.mime, compressed: !!entry.compressed, bytes: bytes.length });
}

// O índice preserva a associação uuid ↔ arquivo, que o pack.mjs precisa para reconstruir
// o manifest e manter as referências dentro do template funcionando.
writeFileSync(
  join(ROOT, 'assets/index.json'),
  JSON.stringify({ assets: assetIndex, extResources }, null, 2) + '\n'
);

// ---------------------------------------------------------------- app
// O template é um documento HTML completo: <x-dc> carrega a marcação e
// <script data-dc-script> carrega a lógica. Separamos os dois.
const SCRIPT_OPEN = '<script type="text/x-dc" data-dc-script="">';
const si = template.indexOf(SCRIPT_OPEN);
if (si === -1) throw new Error('bloco data-dc-script não encontrado no template');
const se = template.indexOf('</script>', si);

const markup = template.slice(0, si);
const logic = template.slice(si + SCRIPT_OPEN.length, se);
const tail = template.slice(se + '</script>'.length);

mkdirSync(join(ROOT, 'src'), { recursive: true });
writeFileSync(join(ROOT, 'src/index.html'), markup.trimEnd() + '\n');
writeFileSync(join(ROOT, 'src/app.js'), logic.trim() + '\n');
writeFileSync(join(ROOT, 'src/tail.html'), tail);

console.log(`bundle desempacotado a partir de ${SRC}`);
console.table(assetIndex.map(({ path, mime, bytes }) => ({ path, mime, bytes })));
console.log(`src/index.html   ${markup.length} chars (marcação x-dc)`);
console.log(`src/app.js       ${logic.length} chars (lógica DCLogic)`);
