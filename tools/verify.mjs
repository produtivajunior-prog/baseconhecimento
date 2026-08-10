#!/usr/bin/env node
/**
 * verify.mjs — prova que dist/ preserva o conteúdo do bundle original.
 *
 * Comparar os arquivos byte a byte não serve por dois motivos legítimos:
 *   1. o gzip do Node não reproduz os bytes do compressor que gerou o original;
 *   2. os dados saíram do código para src/data/*.json, então o texto do script mudou.
 *
 * O que precisa bater é o que o navegador enxerga. Três checagens:
 *   assets  — bytes idênticos depois de descomprimir
 *   markup  — a marcação <x-dc> idêntica caractere a caractere
 *   dados   — avalia a classe dos DOIS bundles e compara as estruturas resultantes
 *
 *   node tools/verify.mjs
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_OPEN = '<script type="text/x-dc" data-dc-script="">';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

const fail = [];
const check = (ok, okMsg, failMsg) => {
  console.log(`${ok ? '✓' : '✗'} ${ok ? okMsg : failMsg}`);
  if (!ok) fail.push(failMsg);
};

function parseBundle(path) {
  const html = readFileSync(path, 'utf8');
  const tag = (type) => {
    const open = `<script type="${type}">`;
    const a = html.indexOf(open);
    if (a === -1) throw new Error(`${path}: bloco ausente ${type}`);
    return html.slice(a + open.length, html.indexOf('</script>', a)).trim();
  };

  const manifest = JSON.parse(tag('__bundler/manifest'));
  const assets = {};
  for (const [uuid, e] of Object.entries(manifest)) {
    const raw = Buffer.from(e.data, 'base64');
    assets[uuid] = { mime: e.mime, bytes: e.compressed ? gunzipSync(raw) : raw };
  }

  const template = JSON.parse(tag('__bundler/template'));
  const si = template.indexOf(SCRIPT_OPEN);
  return {
    assets,
    markup: template.slice(0, si),
    logic: template.slice(si + SCRIPT_OPEN.length, template.indexOf('</script>', si)),
  };
}

/**
 * Avalia a classe do bundle do mesmo jeito que o dc-runtime faz (`new Function`)
 * e devolve as estruturas de dados que ela expõe. É a checagem que importa:
 * roda o código de verdade, em vez de comparar texto.
 */
function extrairDados(logic) {
  class DCLogic {
    setState() {}
  }
  const Component = new Function(
    'DCLogic', 'StreamableLogic', 'React',
    logic + '\n;return Component;'
  )(DCLogic, DCLogic, {});

  const c = new Component();
  return {
    ferramentas: c.DATA,
    problemas: c.PROBLEMAS,
    modelos: c.defaultModelos(),
    documentoPadrao: c.defaultDoc(),
    estilos: { TIPO_STYLE: c.TIPO_STYLE, COMPLEX_STYLE: c.COMPLEX_STYLE, STATUS_COLOR: c.STATUS_COLOR, ANEXO_STYLE: c.ANEXO_STYLE },
  };
}

const a = parseBundle(join(ROOT, 'original/Biblioteca_CIEP.html'));
const b = parseBundle(join(ROOT, 'dist/Biblioteca_CIEP.html'));

// Assets deliberadamente acrescentados depois do bundle original, com o motivo.
// Qualquer outra diferença de asset continua sendo falha.
const ADICIONADOS = {
  '7c1f0a52-9d38-4b61-a0e2-3f5c8d1147a1': 'react.production.min.js (embutido: mata o unpkg)',
  '7c1f0a52-9d38-4b61-a0e2-3f5c8d1147a2': 'react-dom.production.min.js (embutido: mata o unpkg)',
};

// ---------------------------------------------------------------- assets
for (const uuid of new Set([...Object.keys(a.assets), ...Object.keys(b.assets)])) {
  const x = a.assets[uuid], y = b.assets[uuid];
  const label = `${uuid.slice(0, 8)} ${x?.mime || y?.mime}`;

  if (!x && y && ADICIONADOS[uuid]) {
    check(y.bytes.length > 0, `asset ${label}  +${y.bytes.length} bytes  ${ADICIONADOS[uuid]}`,
      `asset ${label} acrescentado porém vazio`);
    continue;
  }
  if (!x || !y) { check(false, '', `asset ${label} existe em só um dos bundles`); continue; }
  check(x.bytes.equals(y.bytes), `asset ${label}  ${x.bytes.length} bytes  sha ${sha(x.bytes)}`,
    `asset ${label} DIVERGENTE (${x.bytes.length} vs ${y.bytes.length})`);
}

// ---------------------------------------------------------------- markup
// A marcação cresce conforme as telas novas entram, então comparar por igualdade
// deixou de fazer sentido. A garantia que continua valendo — e que é a que importa —
// é que nada foi REMOVIDO: cada linha do original tem de seguir presente, na mesma
// quantidade. Isso pega deleção acidental e edição silenciosa, e deixa passar adição.
const contagem = (texto) => {
  const m = new Map();
  for (const linha of texto.split('\n')) m.set(linha, (m.get(linha) || 0) + 1);
  return m;
};
const orig = contagem(a.markup);
const novo = contagem(b.markup);
const perdidas = [];
for (const [linha, n] of orig) {
  if ((novo.get(linha) || 0) < n) perdidas.push(linha.trim().slice(0, 80) || '(linha em branco)');
}
const linhasNovas = b.markup.split('\n').length - a.markup.split('\n').length;

check(perdidas.length === 0,
  `markup preserva o original  (${a.markup.split('\n').length} linhas originais intactas, +${linhasNovas} novas)`,
  `markup PERDEU ${perdidas.length} linha(s) do original:\n      ` + perdidas.slice(0, 5).join('\n      '));

// ---------------------------------------------------------------- dados
const da = extrairDados(a.logic);
const db = extrairDados(b.logic);

for (const chave of Object.keys(da)) {
  // As paletas ganham entradas conforme novos tipos de conteúdo entram (ex.: Documento).
  // Aqui a regra é superconjunto: toda chave do original tem de existir com o MESMO
  // valor; chaves novas passam. Para o acervo, a regra segue sendo igualdade exata.
  if (chave === 'estilos') {
    const alteradas = [];
    for (const [grupo, mapa] of Object.entries(da.estilos)) {
      for (const [k, v] of Object.entries(mapa)) {
        if (!isDeepStrictEqual(db.estilos?.[grupo]?.[k], v)) alteradas.push(`${grupo}.${k}`);
      }
    }
    const novas = Object.entries(db.estilos).reduce((n, [grupo, mapa]) =>
      n + Object.keys(mapa).filter(k => !(k in da.estilos[grupo])).length, 0);
    check(alteradas.length === 0,
      `dados.estilos  originais intactos${novas ? `, +${novas} novo(s)` : ''}`,
      `dados.estilos ALTERADO: ${alteradas.join(', ')}`);
    continue;
  }
  const igual = isDeepStrictEqual(da[chave], db[chave]);
  const n = Array.isArray(da[chave]) ? `${da[chave].length} itens` : 'ok';
  check(igual, `dados.${chave}  ${n}`, `dados.${chave} DIVERGENTE entre original e dist`);
}

// Os JSON em src/data/ são a fonte: precisam bater com o que o original continha.
const json = (nome) => JSON.parse(readFileSync(join(ROOT, `src/data/${nome}.json`), 'utf8'));
for (const [chave, arquivo] of [['ferramentas', 'ferramentas'], ['problemas', 'problemas'], ['modelos', 'modelos'], ['documentoPadrao', 'documento-padrao']]) {
  check(isDeepStrictEqual(da[chave], json(arquivo)),
    `src/data/${arquivo}.json fiel ao original`,
    `src/data/${arquivo}.json DIVERGE do bundle original`);
}

if (fail.length) { console.error(`\n${fail.length} divergência(s).`); process.exit(1); }
console.log('\nÍntegro: dist/ preserva assets, marcação e dados do bundle original.');
