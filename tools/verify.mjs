#!/usr/bin/env node
/**
 * verify.mjs — valida o acervo em src/data/ e prova que dist/ o carrega fielmente.
 *
 * Até a Fase 1 este script comparava dist/ com original/ (o MVP herdado). Isso servia
 * enquanto o conteúdo era o mesmo; com o acervo real entrando, virou um "nada mudou".
 * Agora ele garante o que importa para quem edita conteúdo:
 *
 *   schema        — cada item tem os campos certos, com valores do enum de taxonomia.json
 *   integridade   — toda referência por id aponta para algo que existe
 *   revisão       — nada entra em ferramentas.json/escopos.json sem revisão aprovada
 *   round-trip    — o bundle em dist/ carrega exatamente o que está em src/data/
 *   assets        — os bytes dos assets do bundle batem com os arquivos em assets/ e vendor/
 *   markup        — a marcação do bundle é src/index.html, sem edição à mão em dist/
 *
 * Itens sem o campo `revisao` são conteúdo herdado do MVP: enquanto
 * taxonomia.legadoPermitido for true eles passam com checagem frouxa e aparecem como aviso.
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
const warn = [];
const check = (ok, okMsg, failMsg) => {
  console.log(`${ok ? '✓' : '✗'} ${ok ? okMsg : failMsg}`);
  if (!ok) fail.push(failMsg);
};
const aviso = (msg) => { console.log(`! ${msg}`); warn.push(msg); };

const json = (nome) => JSON.parse(readFileSync(join(ROOT, `src/data/${nome}.json`), 'utf8'));

// ================================================================ src/data
const T = json('taxonomia');
const ferramentas = json('ferramentas');
const escopos = json('escopos');
const problemas = json('problemas');
const modelos = json('modelos');
const documentoPadrao = json('documento-padrao');
const cases = json('cases');

const enumDe = (obj) => Array.isArray(obj) ? obj : Object.keys(obj);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^@\s]+@produtivajunior\.com\.br$/;
const isStrArr = (v, min = 0) => Array.isArray(v) && v.length >= min && v.every((x) => typeof x === 'string');

const problemas_ = [];
const p = (ctx, msg) => problemas_.push(`${ctx}: ${msg}`);

// ---------------------------------------------------------------- ferramentas
const ids = new Set();
let legados = 0;
const CAMPOS_TEXTO = ['nome', 'tipo', 'categoria', 'complexidade', 'tempo', 'status', 'freq', 'atualizado', 'descricao', 'objetivo', 'problema'];
const CAMPOS_LISTA = ['quandoUsar', 'quandoNao', 'entradas', 'saidas', 'passos', 'perguntas', 'cuidados', 'exemplos'];

for (const it of ferramentas) {
  const ctx = `ferramentas[${it.id ?? '?'}]`;
  if (typeof it.id !== 'string' || !it.id) { p(ctx, 'sem id'); continue; }
  if (ids.has(it.id)) p(ctx, 'id duplicado');
  ids.add(it.id);

  const legado = !it.revisao;
  if (legado) legados++;

  for (const c of CAMPOS_TEXTO) if (typeof it[c] !== 'string' || !it[c]) p(ctx, `campo "${c}" ausente ou vazio`);
  for (const c of CAMPOS_LISTA) if (!isStrArr(it[c])) p(ctx, `campo "${c}" precisa ser lista de strings`);
  if (!Array.isArray(it.anexos)) p(ctx, 'campo "anexos" precisa ser lista');

  if (!enumDe(T.tipos).includes(it.tipo)) p(ctx, `tipo "${it.tipo}" fora da taxonomia`);
  if (!enumDe(T.categorias).includes(it.categoria)) p(ctx, `categoria "${it.categoria}" fora da taxonomia`);
  if (!enumDe(T.complexidade).includes(it.complexidade)) p(ctx, `complexidade "${it.complexidade}" fora da taxonomia`);
  if (!enumDe(T.status).includes(it.status)) p(ctx, `status "${it.status}" fora da taxonomia`);
  if (!enumDe(T.freq).includes(it.freq)) p(ctx, `freq "${it.freq}" fora da taxonomia`);

  for (const [i, a] of (it.anexos || []).entries()) {
    const actx = `${ctx}.anexos[${i}]`;
    if (typeof a.nome !== 'string' || !a.nome) p(actx, 'sem nome');
    if (!enumDe(T.anexos).includes(a.tipo)) p(actx, `tipo "${a.tipo}" fora da taxonomia`);
    if (!legado && it.status === 'Ativo' && !(typeof a.url === 'string' && /^https:\/\//.test(a.url))) p(actx, 'anexo de item Ativo precisa de url https');
  }

  if (legado) {
    if (!KEBAB.test(it.id) && !/^[a-z0-9]+$/.test(it.id)) p(ctx, 'id fora do padrão');
    if (!T.legadoPermitido) p(ctx, 'item legado (sem "revisao") não é mais aceito');
    if (T.tipos[it.tipo]?.legado === undefined && it.tipo === 'Escopo') p(ctx, 'tipo Escopo sem marca de legado');
    continue;
  }

  // --- schema novo (item extraído do acervo real)
  if (!KEBAB.test(it.id)) p(ctx, 'id precisa ser kebab-case');
  for (const proibido of ['acessos', 'nota', 'etapa']) if (proibido in it) p(ctx, `campo "${proibido}" não existe mais no schema`);
  if (T.tipos[it.tipo]?.legado) p(ctx, `tipo "${it.tipo}" é legado`);
  if (T.categorias[it.categoria]?.legado) p(ctx, `categoria "${it.categoria}" é legada`);
  if (!ISO.test(it.atualizado)) p(ctx, `atualizado "${it.atualizado}" precisa ser YYYY-MM-DD`);
  if (!it.responsavel || typeof it.responsavel !== 'object' || typeof it.responsavel.nome !== 'string' || !EMAIL.test(it.responsavel.email || ''))
    p(ctx, 'responsavel precisa ser {nome, email @produtivajunior.com.br}');
  if (!Array.isArray(it.fontes) || !it.fontes.length) p(ctx, 'fontes[] vazio: todo item real precisa de origem');
  for (const [i, f] of (it.fontes || []).entries()) {
    if (!['drive-pdf', 'drive-sheet', 'drive-doc', 'hangar', 'manual'].includes(f.tipo)) p(`${ctx}.fontes[${i}]`, `tipo "${f.tipo}" desconhecido`);
    if (typeof f.id !== 'string' || !f.id) p(`${ctx}.fontes[${i}]`, 'sem id');
  }
  if (!it.origem || typeof it.origem !== 'object') p(ctx, 'origem{} (campo → fonte) ausente');
  const r = it.revisao;
  if (r.status !== 'aprovado') p(ctx, `revisao.status "${r.status}" — só itens aprovados entram em ferramentas.json (rascunhos ficam em src/data/rascunhos/)`);
  if (!EMAIL.test(r.revisor || '')) p(ctx, 'revisao.revisor precisa ser e-mail @produtivajunior.com.br');
  if (!ISO.test(r.data || '')) p(ctx, 'revisao.data precisa ser YYYY-MM-DD');
  if (it.status === 'Em construção' && !isStrArr(it.pendencias, 1)) p(ctx, 'item "Em construção" precisa listar pendencias[]');
  for (const [i, a] of (it.anexos || []).entries()) {
    if (T.anexos[a.tipo]?.legado) p(`${ctx}.anexos[${i}]`, `tipo de anexo "${a.tipo}" é legado`);
  }
}
check(problemas_.length === 0 || !problemas_.some((x) => x.startsWith('ferramentas')),
  `ferramentas.json  ${ferramentas.length} itens (${ferramentas.length - legados} do acervo, ${legados} legados)`,
  'ferramentas.json com erros de schema');

// ---------------------------------------------------------------- escopos
const escopoIds = new Set();
for (const e of escopos) {
  const ctx = `escopos[${e.id ?? '?'}]`;
  if (typeof e.id !== 'string' || !KEBAB.test(e.id)) { p(ctx, 'id ausente ou fora do kebab-case'); continue; }
  if (escopoIds.has(e.id)) p(ctx, 'id duplicado');
  escopoIds.add(e.id);
  if (typeof e.nome !== 'string' || !e.nome) p(ctx, 'sem nome');
  if (!enumDe(T.gruposEscopo).includes(e.grupo)) p(ctx, `grupo "${e.grupo}" fora da taxonomia`);
  if (!['ativo', 'despriorizado'].includes(e.status)) p(ctx, `status "${e.status}" precisa ser ativo|despriorizado`);
  if (typeof e.descricao !== 'string') p(ctx, 'descricao ausente');
  if (!e.responsavel || !EMAIL.test(e.responsavel.email || '')) p(ctx, 'responsavel {nome,email} ausente');
  if (!Array.isArray(e.fontes) || !e.fontes.length) p(ctx, 'fontes[] vazio');
  if (!e.revisao || e.revisao.status !== 'aprovado' || !EMAIL.test(e.revisao.revisor || '') || !ISO.test(e.revisao.data || ''))
    p(ctx, 'revisao {status:"aprovado", revisor, data} obrigatória');
  if (!Array.isArray(e.etapas) || !e.etapas.length) { p(ctx, 'etapas[] vazio'); continue; }
  const etapaIds = new Set();
  e.etapas.forEach((et, i) => {
    const ectx = `${ctx}.etapas[${i}]`;
    if (typeof et.id !== 'string' || !KEBAB.test(et.id)) p(ectx, 'id ausente ou fora do kebab-case');
    if (etapaIds.has(et.id)) p(ectx, 'id de etapa duplicado dentro do escopo');
    etapaIds.add(et.id);
    if (et.ordem !== i + 1) p(ectx, `ordem ${et.ordem} não corresponde à posição ${i + 1}`);
    if (typeof et.nome !== 'string' || !et.nome) p(ectx, 'sem nome');
    if (!isStrArr(et.ferramentas)) p(ectx, 'ferramentas[] precisa ser lista de ids');
    for (const fid of et.ferramentas || []) if (!ids.has(fid)) p(ectx, `ferramenta "${fid}" não existe em ferramentas.json`);
    if (et.entregaveis !== undefined && !isStrArr(et.entregaveis)) p(ectx, 'entregaveis[] precisa ser lista de strings');
  });
}
check(!problemas_.some((x) => x.startsWith('escopos')),
  `escopos.json  ${escopos.length} escopos, ${escopos.reduce((n, e) => n + (e.etapas?.length || 0), 0)} etapas`,
  'escopos.json com erros de schema');

// ---------------------------------------------------------------- problemas
const pkeys = new Set();
for (const pr of problemas) {
  const ctx = `problemas[${pr.key ?? '?'}]`;
  if (typeof pr.key !== 'string' || !pr.key) p(ctx, 'sem key');
  if (pkeys.has(pr.key)) p(ctx, 'key duplicada');
  pkeys.add(pr.key);
  if (typeof pr.label !== 'string' || !pr.label) p(ctx, 'sem label');
  if (!isStrArr(pr.ids, 1)) p(ctx, 'ids[] vazio');
  for (const id of pr.ids || []) if (!ids.has(id)) p(ctx, `ferramenta "${id}" não existe`);
  for (const id of pr.escopoIds || []) if (!escopoIds.has(id)) p(ctx, `escopo "${id}" não existe`);
}
check(!problemas_.some((x) => x.startsWith('problemas')), `problemas.json  ${problemas.length} problemas, todas as referências resolvem`, 'problemas.json com referências quebradas');

// ---------------------------------------------------------------- modelos
const mids = new Set();
for (const m of modelos) {
  const ctx = `modelos[${m.id ?? '?'}]`;
  if (typeof m.id !== 'string' || !m.id) p(ctx, 'sem id');
  if (mids.has(m.id)) p(ctx, 'id duplicado');
  mids.add(m.id);
  if (m.toolId !== null && !ids.has(m.toolId)) p(ctx, `toolId "${m.toolId}" não existe em ferramentas.json`);
  if (!['canvas', 'grid'].includes(m.layout)) p(ctx, `layout "${m.layout}" precisa ser canvas|grid`);
  if (!Array.isArray(m.blocos) || !m.blocos.length) p(ctx, 'blocos[] vazio');
  for (const [i, b] of (m.blocos || []).entries()) {
    if (typeof b.titulo !== 'string' || !b.titulo) p(`${ctx}.blocos[${i}]`, 'sem titulo');
    if (m.layout === 'canvas' && (typeof b.gc !== 'string' || typeof b.gr !== 'string')) p(`${ctx}.blocos[${i}]`, 'layout canvas exige gc e gr');
  }
}
check(!problemas_.some((x) => x.startsWith('modelos')), `modelos.json  ${modelos.length} modelos, toolId resolve`, 'modelos.json com erros');

// ---------------------------------------------------------------- documento-padrao
{
  const d = documentoPadrao; const ctx = 'documento-padrao';
  if (!['metodologia', 'manual', 'modelo'].includes(d.type)) p(ctx, `type "${d.type}" inválido`);
  for (const c of ['nome', 'sigla', 'subtitulo', 'categoria', 'intro']) if (typeof d[c] !== 'string' || !d[c]) p(ctx, `campo "${c}" ausente`);
  if (!Array.isArray(d.secoes) || !d.secoes.length) p(ctx, 'secoes[] vazio');
  for (const [i, s] of (d.secoes || []).entries()) {
    if (!enumDe(T.gruposDoc).includes(s.grupo)) p(`${ctx}.secoes[${i}]`, `grupo "${s.grupo}" fora de taxonomia.gruposDoc`);
    if (typeof s.titulo !== 'string' || typeof s.descricao !== 'string') p(`${ctx}.secoes[${i}]`, 'titulo/descricao ausentes');
    if (!isStrArr(s.perguntas, 1)) p(`${ctx}.secoes[${i}]`, 'perguntas[] vazio');
  }
  check(!problemas_.some((x) => x.startsWith(ctx)), `documento-padrao.json  ${d.sigla} com ${d.secoes.length} seções`, 'documento-padrao.json com erros');
}

// ---------------------------------------------------------------- cases
const cids = new Set();
const HTTPS = /^https:\/\//;
for (const c of cases) {
  const ctx = `cases[${c.id ?? '?'}]`;
  if (typeof c.id !== 'string' || !KEBAB.test(c.id)) { p(ctx, 'id ausente ou fora do kebab-case'); continue; }
  if (cids.has(c.id)) p(ctx, 'id duplicado');
  cids.add(c.id);
  for (const k of ['cliente', 'segmento', 'resumo']) if (typeof c[k] !== 'string' || !c[k]) p(ctx, `campo "${k}" ausente`);
  if (c.escopoId !== null && c.escopoId !== undefined && !escopoIds.has(c.escopoId)) p(ctx, `escopoId "${c.escopoId}" não existe em escopos.json`);
  if ((c.escopoId === null || c.escopoId === undefined) && !(typeof c.escopoNome === 'string' && c.escopoNome)) p(ctx, 'sem escopoId: informe escopoNome');
  if (c.porte !== undefined && c.porte !== '' && !enumDe(T.portes).includes(c.porte)) p(ctx, `porte "${c.porte}" fora da taxonomia`);
  const eq = c.equipe || {};
  const pessoa = (x, quem) => { if (!x || typeof x.nome !== 'string' || !x.nome) p(ctx, `${quem}: nome ausente`); if (x && x.email && !EMAIL.test(x.email)) p(ctx, `${quem}: e-mail precisa ser @produtivajunior.com.br`); };
  pessoa(eq.gerente, 'gerente');
  if (!Array.isArray(eq.consultores) || eq.consultores.length !== 2) p(ctx, 'equipe.consultores precisa ter exatamente 2 consultores');
  else eq.consultores.forEach((x, i) => pessoa(x, `consultor ${i + 1}`));
  for (const k of ['resultados', 'aprendizados', 'tags', 'ferramentas']) if (c[k] !== undefined && !isStrArr(c[k])) p(ctx, `"${k}" precisa ser lista de strings`);
  for (const fid of c.ferramentas || []) if (!ids.has(fid)) p(ctx, `ferramenta "${fid}" não existe em ferramentas.json`);
  for (const [i, d] of (c.documentos || []).entries()) {
    if (typeof d.nome !== 'string' || !d.nome) p(`${ctx}.documentos[${i}]`, 'sem nome');
    if (!enumDe(T.documentosCase).includes(d.tipo)) p(`${ctx}.documentos[${i}]`, `tipo "${d.tipo}" fora da taxonomia`);
    if (!HTTPS.test(d.url || '')) p(`${ctx}.documentos[${i}]`, 'url precisa ser https');
  }
  if (c.video && c.video.url && !HTTPS.test(c.video.url)) p(ctx, 'video.url precisa ser https');
  if (c.foto) {
    const u = typeof c.foto.url === 'string' ? c.foto.url : '';
    if (!HTTPS.test(u) && !/^data:image\/(jpeg|png|webp);base64,/.test(u)) p(ctx, 'foto.url precisa ser https (Drive) ou data:image/… (enviada pelo formulário)');
    if (u.length > 1500000) p(ctx, `foto embutida com ${Math.round(u.length / 1024)} KB — acima de 1,5 MB; reduza a imagem`);
    if (c.foto.legenda !== undefined && typeof c.foto.legenda !== 'string') p(ctx, 'foto.legenda precisa ser texto');
  }
  if (!ISO.test(c.atualizado || '')) p(ctx, 'atualizado precisa ser YYYY-MM-DD');
  if (!c.cadastradoPor || typeof c.cadastradoPor.nome !== 'string') p(ctx, 'cadastradoPor {nome, email} ausente');
}
check(!problemas_.some((x) => x.startsWith('cases')), `cases.json  ${cases.length} case(s), referências resolvem`, 'cases.json com erros');

for (const msg of problemas_) console.log(`    ${msg}`);
if (legados && T.legadoPermitido) aviso(`${legados} item(ns) legado(s) do MVP ainda em ferramentas.json — sem lastro no acervo, removidos na promoção`);

// ================================================================ dist
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
 * Avalia o script do bundle do mesmo jeito que o dc-runtime faz (`new Function`):
 * devolve o DADOS embutido e instancia a classe para provar que ela constrói.
 */
function extrairDados(logic) {
  class DCLogic { setState() {} }
  const { DADOS, Component } = new Function(
    'DCLogic', 'StreamableLogic', 'React', 'window',
    logic + '\n;return { DADOS, Component };'
  )(DCLogic, DCLogic, {}, undefined);
  const c = new Component();
  c.renderVals();
  return DADOS;
}

let dist;
try { dist = parseBundle(join(ROOT, 'dist/Hangar.html')); }
catch (e) { check(false, '', `dist/Hangar.html ilegível: ${e.message} — rode node tools/pack.mjs`); }

if (dist) {
  // ---------------------------------------------------------------- assets
  const index = JSON.parse(readFileSync(join(ROOT, 'assets/index.json'), 'utf8'));
  for (const a of index.assets) {
    const esperado = readFileSync(join(ROOT, a.path));
    const y = dist.assets[a.uuid];
    check(y && y.bytes.equals(esperado), `asset ${a.uuid.slice(0, 8)} ${a.mime}  ${esperado.length} bytes  sha ${sha(esperado)}`,
      `asset ${a.path} ausente ou DIVERGENTE no bundle`);
  }
  const extras = Object.keys(dist.assets).filter((u) => !index.assets.some((a) => a.uuid === u));
  check(extras.length === 0, 'nenhum asset fora de assets/index.json', `assets no bundle sem origem em assets/index.json: ${extras.join(', ')}`);

  // ---------------------------------------------------------------- markup
  const srcMarkup = readFileSync(join(ROOT, 'src/index.html'), 'utf8');
  check(dist.markup === srcMarkup, `markup = src/index.html  (${srcMarkup.length} chars, sha ${sha(srcMarkup)})`,
    'markup do bundle DIVERGE de src/index.html — dist/ foi editado à mão ou o pack está desatualizado');

  // ---------------------------------------------------------------- round-trip
  let dados;
  try { dados = extrairDados(dist.logic); }
  catch (e) { check(false, '', `o script do bundle não avalia: ${e.message}`); }
  if (dados) {
    const pares = [['ferramentas', ferramentas], ['escopos', escopos], ['taxonomia', T], ['problemas', problemas], ['modelos', modelos], ['documentoPadrao', documentoPadrao], ['cases', cases]];
    for (const [chave, esperado] of pares) {
      const n = Array.isArray(esperado) ? `${esperado.length} itens` : 'ok';
      check(isDeepStrictEqual(dados[chave], esperado), `dist carrega DADOS.${chave}  ${n}`, `DADOS.${chave} no bundle DIVERGE de src/data — rode node tools/pack.mjs`);
    }
  }
}

console.log('');
if (warn.length) console.log(`${warn.length} aviso(s).`);
if (fail.length) { console.error(`${fail.length} falha(s).`); process.exit(1); }
console.log('tudo certo.');
