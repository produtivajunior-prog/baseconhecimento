#!/usr/bin/env node
/**
 * rascunho.mjs — transforma o que está em fontes/ em rascunhos de conteúdo para revisão.
 *
 *   node tools/rascunho.mjs --inventario     fontes/drive/*.txt → fontes/inventario.json
 *   node tools/rascunho.mjs --escopos        PPGP 2026 (fontes/ppgp-2026) + escopos-mapa → src/data/rascunhos/escopo-*.json
 *   node tools/rascunho.mjs pmmc swot …      PDF de metodologia + ferramentas-mapa → src/data/rascunhos/<id>.json
 *   node tools/rascunho.mjs --ferramentas    todas as ferramentas do mapa (inclusive stubs)
 *
 * Regras que não se negociam:
 *   - o texto vem do arquivo-fonte; o que o parser não acha fica null e vai para `pendencias`;
 *   - todo campo carrega `origem` (drive:<id>#<seção> | ppgp:<arquivo>#p<página> | manual:<e-mail>);
 *   - o rascunho nasce com revisao.status = "rascunho" e nunca entra no pack.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRIVE = join(ROOT, 'fontes/drive');
const HANGAR = join(ROOT, 'fontes/hangar');
const OUT = join(ROOT, 'src/data/rascunhos');
const HOJE = new Date().toISOString().slice(0, 10);
const sha = (t) => createHash('sha256').update(t).digest('hex');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const salvar = (nome, obj) => { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, nome), JSON.stringify(obj, null, 2) + '\n'); console.log(`  → src/data/rascunhos/${nome}`); };

// ---------------------------------------------------------------- fontes/drive
function lerFonte(id) {
  const p = join(DRIVE, `${id}.txt`);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  const [cab, ...resto] = raw.split('\n---\n');
  const meta = {};
  for (const l of cab.split('\n')) { const m = /^# (\w+): ?(.*)$/.exec(l); if (m) meta[m[1]] = m[2].trim(); }
  const corpo = resto.join('\n---\n');
  return { id, meta, corpo, hash: sha(corpo) };
}
const urlDrive = (f) => (f.meta.url || '').replace(/[?&]ouid=[^&]*/, '').replace(/\?usp=drivesdk$/, '') || `https://drive.google.com/file/d/${f.id}/view`;
const tipoFonte = (f) => /spreadsheet/.test(f.meta.mimeType) ? 'drive-sheet' : /document/.test(f.meta.mimeType) ? 'drive-doc' : 'drive-pdf';

function inventario() {
  const itens = readdirSync(DRIVE).filter((n) => n.endsWith('.txt')).map((n) => lerFonte(n.replace(/\.txt$/, '')))
    .map((f) => ({ id: f.id, nome: f.meta.nome, mimeType: f.meta.mimeType, dono: f.meta.dono, uso: f.meta.uso, url: urlDrive(f), extraidoEm: f.meta.extraidoEm, sha256: f.hash, bytes: Buffer.byteLength(f.corpo) }))
    .sort((a, b) => (a.uso || '').localeCompare(b.uso || '') || a.nome.localeCompare(b.nome));
  writeFileSync(join(ROOT, 'fontes/inventario.json'), JSON.stringify({ geradoEm: HOJE, arquivos: itens }, null, 2) + '\n');
  console.log(`fontes/inventario.json  ${itens.length} arquivos`);
}

// ---------------------------------------------------------------- texto
const desescapar = (t) => t.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, '$1');
const limpa = (t) => desescapar(t).replace(/\s+/g, ' ').trim();
const slug = (t) => limpa(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const semAcento = (t) => limpa(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const caixaNormal = (t) => { t = limpa(t); if (!(t === t.toUpperCase() && /[A-ZÀ-Ú]/.test(t))) return t; return t.split(' ').map((w, i) => (w.length <= 4 && /^[A-ZÀ-Ú.]+$/.test(w) && (i > 0 || w.length <= 3)) ? w : (i === 0 ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase())).join(' '); };
const frases = (t) => limpa(t).split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú"“(])/).map((s) => s.trim()).filter(Boolean);
const perguntasDe = (t) => { t = limpa(t); const partes = t.split(/\?\s*/); if (!/\?\s*$/.test(t)) partes.pop(); return partes.map((s) => s.trim()).filter((s) => s.length > 6).map((s) => s + '?'); };
const cortaAposHifenacao = (t) => t.replace(/([a-zà-ú])- ([a-zà-ú])/g, '$1$2'); // "ga- rantindo" → "garantindo" (quebra de coluna do PDF)

const RUIDO = /^(LOGO|PRODUTIVA|J U N I O R|JÚNIOR|PÁGINA \d+|PAGINA \d+|<https?:\/\/[^>]+>)$/i;
const eMaiuscula = (l) => l.length <= 70 && /[A-ZÀ-Ú]/.test(l) && l === l.toUpperCase() && !/^\d/.test(l);
const NUM = /^(\d{1,2})(?:\.(\d))?\s*[.)]?\s*[-–]?\s+(.+)$/;

/** Divide o corpo em seções: { grupo, titulo, num, paragrafos[] }. */
function seccionar(corpo) {
  const linhas = cortaAposHifenacao(desescapar(corpo)).split('\n').map((l) => l.trim()).filter((l) => l && !RUIDO.test(l));
  const secoes = [];
  let grupo = 'INTRODUÇÃO', atual = null, ultimaMai = '', viuCabecalho = false;
  const nova = (titulo, num) => { atual = { grupo, titulo, num, paragrafos: [] }; secoes.push(atual); };
  for (let l of linhas) {
    // "INTRODUÇÃO INTRODUÇÃO INTRODUÇÃO" → cabeçalho repetido pelo layout do PDF
    const dedupe = l.split(' ').filter((w, i, a) => i === 0 || w !== a[i - 1] || w.length < 4).join(' ');
    if (eMaiuscula(dedupe)) {
      // "O CORAÇÃO DO NEGÓCIO ENTRADAS" → fica o último grupo conhecido
      const known = ['INTRODUÇÃO', 'ENTRADAS', 'PROCESSOS', 'SAÍDAS', 'SUPORTE', 'RECOMENDAÇÕES', 'CONSTRUÇÃO', 'BENEFÍCIOS', 'PRINCIPAIS PONTOS', 'PASSO A PASSO', 'DEFINIÇÃO'];
      const k = known.find((g) => dedupe.endsWith(g) || dedupe.startsWith(g));
      const g = (k && dedupe !== k && dedupe.split(' ').length > 3) ? k : dedupe.replace(/:$/, '');
      if (g === ultimaMai) continue; // cabeçalho de página repetido
      ultimaMai = g; grupo = g; atual = null; viuCabecalho = true; continue;
    }
    if (!viuCabecalho) continue; // título do documento ("[CIEP] Metodologia - PMMC")
    const m = NUM.exec(l);
    if (m && limpa(m[3]).length <= 110) { nova(limpa(m[3]).replace(/:$/, ''), m[2] ? `${m[1]}.${m[2]}` : m[1]); continue; }
    if (m) { // título numerado colado ao corpo: fica o começo como título, a linha inteira como parágrafo
      const t = limpa(m[3]); const titulo = t.split(/(?<=[a-zà-ú:])\s+(?=[A-ZÀ-Ú])/)[0].slice(0, 90).replace(/:$/, '');
      nova(titulo, m[2] ? `${m[1]}.${m[2]}` : m[1]); atual.paragrafos.push(t.slice(titulo.length).replace(/^[:\s]+/, '') || t); continue;
    }
    // "Situação Atual", "Perguntas Chave:", "Como coletar:" — subtítulos em caixa normal
    if (l.length <= 60 && /^[A-ZÀ-Ú][^.!?]*:?$/.test(l) && l.split(' ').length <= 8) { nova(l.replace(/:$/, ''), null); continue; }
    if (!atual) nova(null, null);
    atual.paragrafos.push(limpa(l));
  }
  return secoes;
}

const ref = (f, s) => `drive:${f.id}#${slug(s.grupo)}${s.titulo ? '/' + slug(s.titulo) : ''}`;
const acha = (secoes, re) => secoes.filter((s) => re.test(semAcento(s.grupo)) || (s.titulo && re.test(semAcento(s.titulo))));
const texto = (s) => s.paragrafos.join(' ');

/** Mapeia as seções da metodologia para os campos da ficha. Devolve { campos, origem }. */
function extrairFicha(f, secoes, opts = {}) {
  const campos = {}; const origem = {};
  const set = (k, v, s) => { if (v && (!Array.isArray(v) || v.length)) { campos[k] = v; origem[k] = Array.isArray(s) ? s.map((x) => ref(f, x)).join(' ') : ref(f, s); } };

  const intro = secoes.filter((s) => /^introducao/.test(semAcento(s.grupo)) && s.paragrafos.length && !/referencia/.test(semAcento(s.titulo || '')));
  const defin = acha(secoes, /^(o que e|definicao|1\b)|^o que e/).filter((s) => s.paragrafos.length);
  const base = intro[0] || defin[0];
  if (base) {
    const fr = frases(texto(base));
    set('descricao', fr[0], base);
    set('objetivo', fr.find((x, i) => i > 0 && /objetiv|permite|serve|garant|proporcion|facilit/i.test(x)) || fr[1] || null, base);
  } else if (defin.length === 0 && secoes[0]) {
    set('descricao', frases(texto(secoes[0]))[0], secoes[0]);
  }
  const prob = acha(secoes, /importancia|situacao atual|principais desafios|estado atual|para que serve/).filter((s) => s.paragrafos.length);
  if (prob.length) set('problema', frases(texto(prob[prob.length - 1]))[0], prob[prob.length - 1]);

  // quando usar: benefícios / importância (uma frase por item)
  const ben = acha(secoes, /beneficio|importancia|para que serve/).filter((s) => s.paragrafos.length);
  if (ben.length) set('quandoUsar', ben.flatMap((s) => frases(texto(s))).map((x) => x.replace(/\.$/, '')).slice(0, 6), ben);

  // passos: seções numeradas de construção / passo a passo; senão, os blocos numerados do canvas
  const grupoPasso = /construcao|como construir|passo a passo|como fazer|como funciona na pratica|como os eixos|etapas para/;
  // só a primeira sequência numerada contínua (a numeração reinicia em RECOMENDAÇÕES, cenários etc.)
  const sequencia = (lista) => { const out = []; for (const s of lista) { const n = parseInt(s.num, 10); if (!out.length || n === parseInt(out[out.length - 1].num, 10) + 1) out.push(s); else if (out.length) break; } return out; };
  let passos = sequencia(secoes.filter((s) => s.num && grupoPasso.test(semAcento(s.grupo)) && !/^\d\.\d/.test(s.num) && !/modelo padrao|beneficio/.test(semAcento(s.titulo || ''))));
  const subs = secoes.filter((s) => s.num && /^\d\.\d/.test(s.num) && grupoPasso.test(semAcento(s.grupo)));
  if (passos.length <= 1 && subs.length) passos = subs;
  if (!passos.length) passos = sequencia(secoes.filter((s) => s.num && /^\d{1,2}$/.test(s.num) && !/recomendac|erro|cuidado|beneficio|modelo padrao|definicao|estrutur|tipos/.test(semAcento(s.grupo + ' ' + (s.titulo || ''))) && !/^introducao$/.test(semAcento(s.grupo))));
  if (!passos.length) passos = secoes.filter((s) => /^passo \d/i.test(s.titulo || ''));
  if (!passos.length) passos = secoes.filter((s) => s.titulo && !s.num && /como funciona|passo a passo|construcao|como fazer/.test(semAcento(s.grupo)) && s.paragrafos.length && !/situacao atual|desafios|para que serve/.test(semAcento(s.titulo)));
  if (!passos.length) { // dicas numeradas dentro de um parágrafo: "1) … 2) … 3) …"
    const par = secoes.flatMap((s) => s.paragrafos).find((p) => /\b1\)\s.+\b2\)\s/.test(p));
    if (par) { const itens = par.split(/\s*\b\d{1,2}\)\s*/).map((x) => x.trim().replace(/;$/, '')).filter(Boolean); if (itens.length >= 3) { set('passos', itens, secoes.find((s) => s.paragrafos.includes(par))); } }
  }
  if (passos.length) set('passos', passos.map((s) => s.titulo + (s.paragrafos.length ? ' — ' + frases(texto(s))[0] : '')), passos);
  if (!campos.passos && opts.checklist) { // checklist: cada grupo em caixa alta vira um passo com seus itens
    const grupos = []; for (const s of secoes) { if (/^introducao$/.test(semAcento(s.grupo))) continue; let g = grupos.find((x) => x.nome === s.grupo); if (!g) grupos.push(g = { nome: s.grupo, itens: [] }); if (s.titulo) g.itens.push(s.titulo); g.itens.push(...s.paragrafos.filter((p) => p.length < 80)); }
    if (grupos.length) set('passos', grupos.map((g) => caixaNormal(g.nome) + ': ' + [...new Set(g.itens)].join(', ')), secoes.slice(0, 1));
  }

  // perguntas: "Perguntas Chave", "Como coletar", "Roteiro de Perguntas" — divididas por "?"
  const perg = secoes.filter((s) => /perguntas? chave|como coletar|roteiro de perguntas|questoes/.test(semAcento(s.titulo || '')));
  let perguntas = perg.flatMap((s) => perguntasDe(texto(s)));
  if (!perguntas.length) perguntas = secoes.flatMap((s) => s.paragrafos.filter((p) => /\?$/.test(p) && p.length < 220).map(limpa));
  if (perguntas.length) set('perguntas', [...new Set(perguntas)].slice(0, 30), perg.length ? perg : secoes.slice(0, 1));

  // cuidados: recomendações / erros comuns / dicas
  const cuid = secoes.filter((s) => /recomendac|erros? comuns|cuidado|\bdicas?\b/.test(semAcento(s.grupo + ' ' + (s.titulo || ''))) && (s.paragrafos.length || s.num));
  if (cuid.length) {
    const itens = cuid.map((s) => s.num && s.titulo ? s.titulo + (s.paragrafos.length ? ' — ' + frases(texto(s))[0] : '') : frases(texto(s))[0]).filter(Boolean);
    set('cuidados', [...new Set(itens)].slice(0, 8), cuid);
  }

  // exemplos: referências, casos, exemplo prático
  const ex = secoes.filter((s) => /referencia|exemplo pratico|exemplo|projeto referencia|caso/.test(semAcento((s.titulo || '') + ' ' + (s.num ? '' : s.grupo))) && (s.paragrafos.length || /referencia/.test(semAcento(s.titulo || ''))));
  if (ex.length) set('exemplos', [...new Set(ex.map((s) => s.paragrafos.length ? (s.titulo ? s.titulo + ': ' : '') + frases(texto(s))[0] : s.titulo))].slice(0, 4), ex);

  return { campos, origem };
}

// ---------------------------------------------------------------- hangar
function lerHangar(id) {
  const p = join(HANGAR, `${id}.md`);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  const meta = {};
  if (fm) for (const l of fm[1].split('\n')) { const m = /^(\w+):\s*(.*)$/.exec(l); if (m) meta[m[1]] = m[2].trim(); }
  const corpo = fm ? raw.slice(fm[0].length) : raw;
  const secoes = {};
  let atual = null;
  for (const l of corpo.split('\n')) {
    const h = /^##\s+(.+)$/.exec(l);
    if (h) { atual = slug(h[1]); secoes[atual] = []; continue; }
    if (atual && l.trim()) secoes[atual].push(l.trim());
  }
  return { id, meta, secoes, hash: sha(corpo) };
}
const listaMd = (ls) => ls.map((l) => l.replace(/^(\d+\.|[-*])\s+/, '').trim()).filter(Boolean);

// ---------------------------------------------------------------- ferramentas
function ferramenta(def, mapa) {
  const dono = mapa.donos[def.responsavel] || def.responsavel.split('@')[0];
  const fontes = []; const origem = {}; const pendencias = [...(def.pendencias || [])];
  const manual = `manual:${def.responsavel}`;
  const item = {
    id: def.id, nome: def.nome, tipo: def.tipo, categoria: def.categoria, complexidade: def.complexidade, tempo: def.tempo,
    status: def.stub ? 'Em construção' : 'Ativo', freq: def.freq,
    responsavel: { nome: dono, email: def.responsavel }, atualizado: HOJE,
    descricao: null, objetivo: null, problema: null,
    quandoUsar: null, quandoNao: null, entradas: null, saidas: null, passos: null, perguntas: null, cuidados: null, exemplos: null,
    anexos: [],
  };
  for (const k of ['nome', 'tipo', 'categoria', 'complexidade', 'tempo', 'freq', 'responsavel']) origem[k] = manual;

  // 1. metodologia do Drive
  const f = def.metodologiaId ? lerFonte(def.metodologiaId) : null;
  if (def.metodologiaId && !f) pendencias.push(`fontes/drive/${def.metodologiaId}.txt não extraído`);
  if (f) {
    fontes.push({ tipo: tipoFonte(f), id: f.id, nome: f.meta.nome, hash: f.hash });
    const { campos, origem: o } = extrairFicha(f, seccionar(f.corpo), { checklist: def.tipo === 'Checklist' });
    for (const k of Object.keys(campos)) { item[k] = campos[k]; origem[k] = o[k]; }
  }
  // 2. página do Hangar (colada à mão) — complementa o que faltou
  const h = lerHangar(def.id);
  if (h) {
    fontes.push({ tipo: 'hangar', id: def.id, nome: h.meta.titulo || def.id, hash: h.hash, url: h.meta.url });
    const mapa = { 'o-que-e': 'descricao', 'quando-usar': 'quandoUsar', 'quando-nao-usar': 'quandoNao', 'passo-a-passo': 'passos', 'perguntas-chave': 'perguntas', 'cuidados': 'cuidados', 'erros-comuns': 'cuidados', 'casos-reais': 'exemplos', 'exemplos': 'exemplos', 'entradas': 'entradas', 'saidas': 'saidas', 'objetivo': 'objetivo', 'problema': 'problema' };
    for (const [sec, campo] of Object.entries(mapa)) {
      if (!h.secoes[sec] || item[campo]) continue;
      const lista = ['descricao', 'objetivo', 'problema'].includes(campo);
      item[campo] = lista ? h.secoes[sec].join(' ') : listaMd(h.secoes[sec]);
      origem[campo] = `hangar:${def.id}#${sec}`;
    }
    for (const sec of Object.keys(h.secoes)) if (!mapa[sec]) pendencias.push(`Seção "${sec}" da página do Hangar não mapeada — revisar`);
  }
  // 3. o que o mapa fornece à mão (entradas/saídas, textos de stub, etc.)
  for (const k of ['descricao', 'objetivo', 'problema', 'quandoUsar', 'quandoNao', 'entradas', 'saidas', 'passos', 'perguntas', 'cuidados', 'exemplos']) {
    if (def[k] && !item[k]) { item[k] = def[k]; origem[k] = manual; }
  }
  // 4. anexos → links do Drive (cada um é uma fonte também)
  for (const a of def.anexos || []) {
    const af = lerFonte(a.driveId);
    const url = af ? urlDrive(af) : `https://drive.google.com/file/d/${a.driveId}/view`;
    if (af && !fontes.some((x) => x.id === af.id)) fontes.push({ tipo: tipoFonte(af), id: af.id, nome: af.meta.nome, hash: af.hash });
    item.anexos.push({ nome: a.nome, tipo: a.tipo, descricao: a.descricao || '', versao: 'v1.0', data: af ? (af.meta.extraidoEm || HOJE) : HOJE, driveId: a.driveId, url });
  }
  origem.anexos = manual;
  if (def.stub && !fontes.length) fontes.push({ tipo: 'manual', id: def.responsavel, nome: 'Stub: sem arquivo-fonte no Drive', hash: null });

  // 5. o que ficou null vira pendência — nunca é inventado
  const faltando = ['descricao', 'objetivo', 'problema', 'quandoUsar', 'quandoNao', 'entradas', 'saidas', 'passos', 'perguntas', 'cuidados', 'exemplos'].filter((k) => item[k] == null);
  if (def.stub) { for (const k of faltando) item[k] = Array.isArray(item.anexos) && ['descricao', 'objetivo', 'problema'].includes(k) ? '' : []; }
  else if (faltando.length) pendencias.push(`Não encontrado na fonte (preencher à mão com origem manual, ou aceitar vazio): ${faltando.join(', ')}`);
  const out = { ...item, fontes, origem, pendencias, revisao: { status: 'rascunho', revisor: null, data: null } };
  if (def.modelo) {
    out.modelo = { id: def.id, toolId: def.id, nome: def.nome, sigla: def.modelo.sigla, fonte: { driveId: def.modelo.fonteId, nome: (def.anexos || []).find((a) => a.driveId === def.modelo.fonteId)?.nome || def.modelo.fonteId },
      layout: def.modelo.layout, registrado: 'Extraído do Modelo Padrão', blocos: def.modelo.blocos };
  }
  if (def.modeloLegadoId) out.modeloLegadoId = def.modeloLegadoId;
  return out;
}

// ---------------------------------------------------------------- escopos
// Base: [PPGP 2026] Revisão dos Escopos (fontes/ppgp-2026/, extraído verbatim por tools/ppgp-extrair.py).
// O mapa curado (fontes/escopos-mapa.json) traz o texto de exibição e as ferramentas vinculadas. Aqui
// conferimos, coluna a coluna e na ordem do slide, que o mapa corresponde ao documento: nenhum item a
// mais, nenhum a menos, nenhum alterado sem guardar o original em `ppgp`.
const COLUNAS_PPGP = { estudar: 'estudar', etapas: 'escopo', entregaveis: 'entregaveis', saber: 'saber', riscos: 'riscos', cases: 'cases' };
const textoDe = (x) => (typeof x === 'string' ? x : x.nome ?? x.texto);
const origDe = (x) => (typeof x === 'string' ? [x] : x.ppgp === undefined ? [textoDe(x)] : [].concat(x.ppgp));
function escopos() {
  const mapa = json(join(ROOT, 'fontes/escopos-mapa.json'));
  const ppgp = json(join(ROOT, mapa.fonte));
  const pdf = ppgp.fonte;
  const manual = `manual:${mapa.responsavel.email}`;
  let erros = 0;
  const erro = (m) => { console.error(`✗ ${m}`); erros++; };
  for (const sl of ppgp.escopos) if (!mapa.escopos.some((d) => d.pagina === sl.pagina)) erro(`slide ${sl.pagina} (${sl.titulo}) não tem escopo no mapa`);
  for (const def of mapa.escopos) {
    const sl = ppgp.escopos.find((s) => s.pagina === def.pagina);
    if (!sl) { erro(`${def.id}: página ${def.pagina} não existe no PPGP`); continue; }
    let fiel = true;
    for (const [campo, col] of Object.entries(COLUNAS_PPGP)) {
      const doc = sl[col].map((x) => (typeof x === 'string' ? x : x.texto));
      const nosso = (def[campo] || []).flatMap(origDe);
      const i = doc.findIndex((t, k) => t !== nosso[k]);
      if (i >= 0 || nosso.length !== doc.length) {
        const k = i >= 0 ? i : doc.length;
        erro(`${def.id}.${campo}: diverge do PPGP p.${def.pagina} no item ${k + 1} — documento "${doc[k] ?? '(fim)'}", mapa "${nosso[k] ?? '(fim)'}"`);
        fiel = false;
      }
    }
    // subtítulos do slide ("GAMIFICAÇÃO:", "CULTURA") viram `frente` da etapa
    let k = 0;
    for (const et of def.etapas) {
      const origs = origDe(et); const x = sl.escopo[k]; k += origs.length;
      const fr = x && typeof x === 'object' ? x.frente : undefined;
      if (semAcento(fr || '') !== semAcento(et.frente || '')) { erro(`${def.id}: etapa "${et.nome}" com frente "${et.frente || ''}", no PPGP "${fr || ''}"`); fiel = false; }
    }
    if (!fiel) continue;

    const vistos = {};
    const etapas = def.etapas.map((et, i) => {
      let id = slug(et.nome).slice(0, 40).replace(/-$/, '');
      if (vistos[id]) id = `${id}-${++vistos[id]}`; else vistos[id] = 1;
      return { id, ordem: i + 1, nome: et.nome, ...(et.frente ? { frente: et.frente } : {}), ferramentas: et.ferramentas || [], ...(et.marcado ? { marcado: true } : {}) };
    });
    const lista = (arr) => (arr || []).map((x) => ({ nome: x.nome, ferramentas: x.ferramentas || [], ...(x.marcado ? { marcado: true } : {}) }));
    const estudar = lista(def.estudar), entregaveis = lista(def.entregaveis);
    const cron = def.cronogramaId ? lerFonte(def.cronogramaId) : null;
    if (def.cronogramaId && !cron) erro(`${def.id}: cronograma ${def.cronogramaId} não está em fontes/drive`);
    const fontes = [{ tipo: 'pdf', nome: pdf.nome, arquivo: pdf.arquivo, pagina: def.pagina, hash: pdf.sha256 }];
    if (cron) fontes.push({ tipo: 'drive-sheet', id: cron.id, nome: cron.meta.nome.trim(), hash: cron.hash, url: urlDrive(cron) });
    const ref = `ppgp:${pdf.arquivo}#p${def.pagina}`;
    const origem = { nome: manual, grupo: manual, descricao: manual, estudar: ref, etapas: ref, entregaveis: ref, saber: ref, riscos: ref, casesReferencia: ref,
      'etapas.ferramentas': manual, 'entregaveis.ferramentas': manual, 'estudar.ferramentas': manual };
    const pendencias = [...(def.pendencias || [])];
    const marcados = [...estudar, ...etapas, ...entregaveis].filter((x) => x.marcado).map((x) => x.nome);
    if (marcados.length) pendencias.push(`Marcados com asterisco no PPGP 2026 (significado a confirmar com o CIEP): ${marcados.join('; ')}`);
    salvar(`escopo-${def.id}.json`, {
      id: def.id, nome: def.nome, grupo: def.grupo, status: 'ativo', descricao: def.descricao, responsavel: mapa.responsavel,
      ...(def.antigosIds ? { antigosIds: def.antigosIds } : {}),
      fontes, estudar, etapas, entregaveis, saber: def.saber.map(textoDe), riscos: def.riscos.map(textoDe),
      casesReferencia: def.cases.map((c) => (typeof c === 'string' ? { nome: c } : { nome: c.nome, ...(c.tipo ? { tipo: c.tipo } : {}) })),
      origem, pendencias, revisao: { status: 'rascunho', revisor: null, data: null },
    });
  }
  if (erros) { console.error(`\n${erros} divergência(s) com o PPGP — corrija fontes/escopos-mapa.json`); process.exitCode = 1; }
}

// ---------------------------------------------------------------- main
const args = process.argv.slice(2);
if (!args.length) { console.log('uso: node tools/rascunho.mjs --inventario | --escopos | --ferramentas | <id>…'); process.exit(1); }
if (args.includes('--inventario')) inventario();
if (args.includes('--escopos')) escopos();
const ids = args.filter((a) => !a.startsWith('--'));
if (args.includes('--ferramentas') || ids.length) {
  const mapa = json(join(ROOT, 'fontes/ferramentas-mapa.json'));
  const alvo = ids.length ? mapa.ferramentas.filter((d) => ids.includes(d.id)) : mapa.ferramentas;
  for (const id of ids) if (!alvo.some((d) => d.id === id)) console.error(`✗ "${id}" não está em fontes/ferramentas-mapa.json`);
  for (const def of alvo) {
    const r = ferramenta(def, mapa);
    const achados = ['descricao', 'objetivo', 'problema', 'quandoUsar', 'quandoNao', 'entradas', 'saidas', 'passos', 'perguntas', 'cuidados', 'exemplos'].filter((k) => r[k] != null).length;
    console.log(`${def.id}  ${achados}/11 campos  ${r.pendencias.length} pendência(s)${def.stub ? '  [stub]' : ''}`);
    salvar(`${def.id}.json`, r);
  }
}
