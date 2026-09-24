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
const trilha = json('trilha');
const produtiva = json('produtiva');

const enumDe = (obj) => Array.isArray(obj) ? obj : Object.keys(obj);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^@\s]+@produtivajunior\.com\.br$/;
const REVISOR = /^[^@\s]+@produtivajunior\.com\.br$|^produtivajunior@gmail\.com$/;
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

  // Contrato do pipeline: campo não encontrado na fonte fica null (nunca inventado) e vai para pendencias[].
  // Só a descrição é obrigatória sempre; o resto pode faltar enquanto a pendência estiver registrada.
  const comPendencia = !legado && Array.isArray(it.pendencias) && it.pendencias.length > 0;
  for (const c of CAMPOS_TEXTO) {
    const vazio = it[c] === null || it[c] === undefined || it[c] === '';
    if (vazio ? !(comPendencia && c !== 'descricao') : typeof it[c] !== 'string') p(ctx, `campo "${c}" ausente ou vazio${comPendencia ? '' : ' (sem pendência registrada)'}`);
  }
  for (const c of CAMPOS_LISTA) {
    const vazio = it[c] === null || it[c] === undefined || (Array.isArray(it[c]) && !it[c].length);
    if (vazio ? !comPendencia : !isStrArr(it[c])) p(ctx, `campo "${c}" precisa ser lista de strings${comPendencia ? '' : ' (ou pendência registrada)'}`);
  }
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
  if (!REVISOR.test(r.revisor || '')) p(ctx, 'revisao.revisor precisa ser e-mail @produtivajunior.com.br (ou a conta institucional)');
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
  if (!e.revisao || e.revisao.status !== 'aprovado' || !REVISOR.test(e.revisao.revisor || '') || !ISO.test(e.revisao.data || ''))
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
    if (et.frente !== undefined && (typeof et.frente !== 'string' || !et.frente)) p(ectx, 'frente precisa ser texto');
    if (et.marcado !== undefined && et.marcado !== true) p(ectx, 'marcado só pode ser true');
  });
  // Campos do PPGP 2026 (Revisão dos Escopos): o que estudar, entregáveis, o que saber, riscos e cases
  for (const campo of ['estudar', 'entregaveis']) {
    if (e[campo] === undefined) continue;
    if (!Array.isArray(e[campo])) { p(ctx, `${campo}[] precisa ser lista`); continue; }
    e[campo].forEach((x, i) => {
      const ictx = `${ctx}.${campo}[${i}]`;
      if (!x || typeof x.nome !== 'string' || !x.nome) p(ictx, 'sem nome');
      if (!isStrArr(x && x.ferramentas)) p(ictx, 'ferramentas[] precisa ser lista de ids');
      for (const fid of (x && x.ferramentas) || []) if (!ids.has(fid)) p(ictx, `ferramenta "${fid}" não existe em ferramentas.json`);
    });
  }
  for (const campo of ['saber', 'riscos']) if (e[campo] !== undefined && !isStrArr(e[campo])) p(ctx, `${campo}[] precisa ser lista de textos`);
  if (e.casesReferencia !== undefined) {
    if (!Array.isArray(e.casesReferencia)) p(ctx, 'casesReferencia[] precisa ser lista');
    else e.casesReferencia.forEach((c, i) => {
      if (!c || typeof c.nome !== 'string' || !c.nome) p(`${ctx}.casesReferencia[${i}]`, 'sem nome');
      if (c && c.tipo !== undefined && c.tipo !== 'cronograma') p(`${ctx}.casesReferencia[${i}]`, 'tipo só pode ser "cronograma"');
    });
  }
  if (e.antigosIds !== undefined && !(isStrArr(e.antigosIds) && e.antigosIds.every((x) => KEBAB.test(x)))) p(ctx, 'antigosIds[] precisa ser lista de ids kebab-case');
  for (const f of e.fontes || []) {
    if (f.tipo !== 'pdf') continue;
    let bytes = null; try { bytes = readFileSync(join(ROOT, f.arquivo || '')); } catch { p(ctx, `fonte PDF "${f.arquivo}" não existe`); }
    if (bytes && createHash('sha256').update(bytes).digest('hex') !== f.hash) p(ctx, `hash da fonte "${f.arquivo}" não confere: o PDF mudou, rode tools/ppgp-extrair.py e tools/rascunho.mjs --escopos`);
  }
}
// ids antigos (escopos fundidos) redirecionam: não podem colidir com um id vigente nem se repetir
{
  const vistos = new Set();
  for (const e of escopos) for (const a of e.antigosIds || []) {
    if (escopoIds.has(a)) p(`escopos[${e.id}]`, `antigosIds "${a}" colide com um escopo vigente`);
    if (vistos.has(a)) p(`escopos[${e.id}]`, `antigosIds "${a}" repetido em mais de um escopo`);
    vistos.add(a);
  }
}
const somaDe = (campo) => escopos.reduce((n, e) => n + (e[campo]?.length || 0), 0);
check(!problemas_.some((x) => x.startsWith('escopos')),
  `escopos.json  ${escopos.length} escopos, ${somaDe('etapas')} etapas, ${somaDe('entregaveis')} entregáveis, ${somaDe('saber') + somaDe('riscos')} perguntas/riscos, ${somaDe('casesReferencia')} cases de referência`,
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
  const pessoa = (x, quem) => { if (!x || typeof x.nome !== 'string' || !x.nome) p(ctx, `${quem}: nome ausente`); if (x && x.email && !EMAIL.test(x.email)) p(ctx, `${quem}: e-mail precisa ser @produtivajunior.com.br`); if (x && x.whatsapp && !/^\d{10,13}$/.test(x.whatsapp)) p(ctx, `${quem}: whatsapp precisa ter só dígitos com DDD (10 a 13)`); };
  pessoa(eq.gerente, 'gerente');
  if (!Array.isArray(eq.consultores) || eq.consultores.length !== 2) p(ctx, 'equipe.consultores precisa ter exatamente 2 consultores');
  else eq.consultores.forEach((x, i) => pessoa(x, `consultor ${i + 1}`));
  for (const k of ['resultados', 'aprendizados', 'tags', 'ferramentas']) if (c[k] !== undefined && !isStrArr(c[k])) p(ctx, `"${k}" precisa ser lista de strings`);
  for (const fid of c.ferramentas || []) if (!ids.has(fid)) p(ctx, `ferramenta "${fid}" não existe em ferramentas.json`);
  for (const [i, d] of (c.documentos || []).entries()) {
    if (typeof d.nome !== 'string' || !d.nome) p(`${ctx}.documentos[${i}]`, 'sem nome');
    if (!enumDe(T.documentosCase).includes(d.tipo)) p(`${ctx}.documentos[${i}]`, `tipo "${d.tipo}" fora da taxonomia`);
    const du = typeof d.url === 'string' ? d.url : '';
    if (!HTTPS.test(du) && !/^data:application\/pdf;base64,/.test(du)) p(`${ctx}.documentos[${i}]`, 'url precisa ser https (Drive) ou data:application/pdf/… (PDF anexado)');
    if (du.length > 11000000) p(`${ctx}.documentos[${i}]`, `PDF embutido com ${Math.round(du.length / 1024)} KB — acima de 8 MB; use o link do Drive`);
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

// telas que um botão de conteúdo (trilha, página Como funciona) pode abrir
const TELAS = ['home', 'biblioteca', 'escopos', 'cases', 'novo-case', 'cadastro', 'recomendar', 'comece', 'produtiva'];

// ---------------------------------------------------------------- trilha (Comece aqui)
{
  const ctx = 'trilha';
  if (!Array.isArray(trilha.passos) || !trilha.passos.length) p(ctx, 'passos precisa ser lista não vazia');
  const pids = new Set();
  for (const [i, t] of (trilha.passos || []).entries()) {
    if (typeof t.id !== 'string' || !KEBAB.test(t.id)) p(`${ctx}.passos[${i}]`, 'id ausente ou fora do kebab-case');
    if (pids.has(t.id)) p(`${ctx}.passos[${i}]`, 'id duplicado'); pids.add(t.id);
    for (const k of ['titulo', 'texto']) if (typeof t[k] !== 'string' || !t[k]) p(`${ctx}.passos[${i}]`, `"${k}" ausente`);
    if (t.acao !== null && t.acao !== undefined && !(t.acao && TELAS.includes(t.acao.tela) && typeof t.acao.label === 'string')) p(`${ctx}.passos[${i}]`, 'acao precisa ser null ou {tela válida, label}');
  }
  const ORIGEM = /^(drive:[A-Za-z0-9_-]+|hangar:[a-z0-9-]+|ppgp:fontes\/[a-z0-9\/._-]+(#p\d+)?|manual:[^@\s]+@[^@\s]+)$/;
  for (const [i, g] of (trilha.glossario || []).entries()) {
    if (typeof g.sigla !== 'string' || !g.sigla) p(`${ctx}.glossario[${i}]`, 'sigla ausente');
    if (g.nome !== null && typeof g.nome !== 'string') p(`${ctx}.glossario[${i}]`, 'nome precisa ser texto ou null');
    if (typeof g.definicao !== 'string' || g.definicao.length < 20) p(`${ctx}.glossario[${i}]`, 'definicao ausente ou curta demais');
    if (!ORIGEM.test(g.origem || '')) p(`${ctx}.glossario[${i}]`, 'origem precisa ser drive:<id>, hangar:<slug>, ppgp:<arquivo>#p<n> ou manual:<e-mail>');
    if (typeof g.pendente !== 'boolean') p(`${ctx}.glossario[${i}]`, 'pendente precisa ser true/false');
  }
  const pend = (trilha.glossario || []).filter((g) => g.pendente).length;
  check(!problemas_.some((x) => x.startsWith('trilha')), `trilha.json  ${(trilha.passos || []).length} passos, ${(trilha.glossario || []).length} termos (${pend} a confirmar)`, 'trilha.json com erros');
}

// ---------------------------------------------------------------- produtiva (Como funciona a Produtiva)
{
  const ctx = 'produtiva';
  const texto = (v) => typeof v === 'string' && v.trim().length > 0;
  if (!/^(manual:[^@\s]+@[^@\s]+)$/.test(produtiva.origem || '')) p(ctx, 'origem precisa ser manual:<e-mail>');
  if (!ISO.test(produtiva.atualizado || '')) p(ctx, 'atualizado precisa ser YYYY-MM-DD');
  const o = produtiva.oQueE || {};
  if (!texto(o.titulo) || !texto(o.texto)) p(`${ctx}.oQueE`, 'titulo e texto obrigatórios');
  for (const [i, a] of (o.atuacao || []).entries()) {
    if (!enumDe(T.gruposEscopo).includes(a.grupo)) p(`${ctx}.oQueE.atuacao[${i}]`, `grupo "${a.grupo}" fora de taxonomia.gruposEscopo`);
    if (!texto(a.nome)) p(`${ctx}.oQueE.atuacao[${i}]`, 'sem nome');
  }
  const aids = new Set();
  for (const [i, a] of (produtiva.areas || []).entries()) {
    const actx = `${ctx}.areas[${a.id ?? i}]`;
    if (!KEBAB.test(a.id || '') || aids.has(a.id)) p(actx, 'id ausente, fora do kebab-case ou repetido');
    aids.add(a.id);
    if (!texto(a.nome) || !texto(a.resumo) || !texto(a.procure)) p(actx, 'nome, resumo e procure obrigatórios');
    if (!isStrArr(a.faz, 1)) p(actx, 'faz[] precisa ter ao menos um item');
    for (const [j, sn] of (a.subnucleos || []).entries()) if (!texto(sn.sigla) || !texto(sn.texto)) p(`${actx}.subnucleos[${j}]`, 'sigla e texto obrigatórios');
  }
  if (!aids.size) p(ctx, 'areas[] vazio');
  for (const [i, f] of ((produtiva.fluxo || {}).passos || []).entries()) {
    if (!texto(f.quem) || !texto(f.titulo) || !texto(f.texto)) p(`${ctx}.fluxo.passos[${i}]`, 'quem, titulo e texto obrigatórios');
    if (f.acao !== null && f.acao !== undefined && !(f.acao && TELAS.includes(f.acao.tela) && texto(f.acao.label))) p(`${ctx}.fluxo.passos[${i}]`, 'acao precisa ser null ou {tela válida, label}');
  }
  for (const [i, m] of ((produtiva.membro || {}).itens || []).entries()) if (!texto(m.titulo) || !texto(m.texto)) p(`${ctx}.membro.itens[${i}]`, 'titulo e texto obrigatórios');
  check(!problemas_.some((x) => x.startsWith('produtiva')), `produtiva.json  ${aids.size} áreas, ${((produtiva.fluxo || {}).passos || []).length} passos do fluxo comercial`, 'produtiva.json com erros');
}

// ---------------------------------------------------------------- ritual trimestral de revisão
{
  const hoje = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const itens = [...ferramentas.filter((f) => f.revisao).map((f) => ({ ...f, _tipo: 'ferramenta' })), ...escopos.map((e) => ({ ...e, _tipo: 'escopo' }))];
  const vencidos = [], proximos = [];
  for (const it of itens) {
    const ctx = `${it._tipo}s[${it.id}]`;
    const px = it.revisao && it.revisao.proximaRevisao;
    if (px !== undefined && !ISO.test(px || '')) p(ctx, 'revisao.proximaRevisao precisa ser YYYY-MM-DD');
    if (it.revisao && it.revisao.nota !== undefined && typeof it.revisao.nota !== 'string') p(ctx, 'revisao.nota precisa ser texto');
    if (px && px < hoje) vencidos.push(it); else if (px && px <= em30) proximos.push(it);
  }
  const rotulo = (it) => `${it.nome} (${(it.responsavel || {}).email || '?'}, ${it.revisao.proximaRevisao})`;
  if (vencidos.length) aviso(`${vencidos.length} conteúdo(s) com revisão vencida: ${vencidos.slice(0, 5).map(rotulo).join('; ')}${vencidos.length > 5 ? '…' : ''} — rode node tools/revisao.mjs`);
  check(true, `revisão trimestral  ${itens.length} conteúdos com data; ${vencidos.length} vencido(s), ${proximos.length} vence(m) em 30 dias`);
}

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
    const pares = [['ferramentas', ferramentas], ['escopos', escopos], ['taxonomia', T], ['problemas', problemas], ['modelos', modelos], ['documentoPadrao', documentoPadrao], ['cases', cases], ['trilha', trilha], ['produtiva', produtiva]];
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
