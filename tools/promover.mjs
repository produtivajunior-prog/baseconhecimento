#!/usr/bin/env node
/**
 * promover.mjs — move um rascunho aprovado para o acervo (src/data).
 *
 *   node tools/promover.mjs pmmc swot            ferramentas
 *   node tools/promover.mjs escopo-map-e-model   escopos
 *   node tools/promover.mjs --aprovados          tudo que já está com revisao.status = "aprovado"
 *   node tools/promover.mjs --remover-legado     tira de ferramentas.json os itens herdados do MVP (sem `revisao`)
 *   node tools/promover.mjs case-<id>            cases publicam direto (sem revisão) em cases.json
 *   node tools/promover.mjs --cases-dir <pasta>   importa todos os *.json de cases que os membros enviaram
 *
 * Exige revisao.status === "aprovado", revisor @produtivajunior.com.br e data. Faz merge por id em
 * ferramentas.json / escopos.json, leva `modelo` para modelos.json, ordena e apaga o rascunho.
 * Depois: node tools/pack.mjs && node tools/verify.mjs
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src/data');
const RASC = join(DATA, 'rascunhos');
const ler = (n) => JSON.parse(readFileSync(join(DATA, `${n}.json`), 'utf8'));
const gravar = (n, v) => writeFileSync(join(DATA, `${n}.json`), JSON.stringify(v, null, 2) + '\n');
const EMAIL = /^[^@\s]+@produtivajunior\.com\.br$/;
// Quem pode aprovar: qualquer e-mail da Produtiva ou a conta institucional (dona do repositório).
const REVISOR = /^[^@\s]+@produtivajunior\.com\.br$|^produtivajunior@gmail\.com$/;
// Ritual trimestral: todo conteúdo aprovado ganha uma data de próxima revisão (3 meses).
const maisMeses = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const args = process.argv.slice(2);
if (!args.length) { console.log('uso: node tools/promover.mjs <id>… | --aprovados | --remover-legado'); process.exit(1); }

let ferramentas = ler('ferramentas');
let escopos = ler('escopos');
let modelos = ler('modelos');
let cases = ler('cases');
let mudou = false;

// --cases-dir <pasta>: copia os JSON enviados pelos membros para rascunhos/ e promove em seguida
const di = args.indexOf('--cases-dir');
if (di >= 0) {
  const dir = args[di + 1];
  if (!dir || !existsSync(dir)) { console.error('--cases-dir precisa de uma pasta existente'); process.exit(1); }
  mkdirSync(RASC, { recursive: true });
  for (const n of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let c; try { c = JSON.parse(readFileSync(join(dir, n), 'utf8')); } catch { console.error(`✗ ${n}: JSON inválido`); continue; }
    if (!c || typeof c.id !== 'string' || c.cliente === undefined) { console.error(`✗ ${n}: não parece um case (sem id/cliente)`); continue; }
    copyFileSync(join(dir, n), join(RASC, `case-${c.id}.json`));
    args.push(`case-${c.id}`);
  }
}

if (args.includes('--remover-legado')) {
  const antes = ferramentas.length;
  const legados = ferramentas.filter((f) => !f.revisao).map((f) => f.id);
  ferramentas = ferramentas.filter((f) => f.revisao);
  modelos = modelos.filter((m) => m.toolId === null || ferramentas.some((f) => f.id === m.toolId));
  const problemas = ler('problemas').map((p) => ({ ...p, ids: p.ids.filter((id) => ferramentas.some((f) => f.id === id)) })).filter((p) => p.ids.length);
  gravar('problemas', problemas);
  console.log(`removidos ${antes - ferramentas.length} item(ns) legado(s): ${legados.join(', ')}`);
  mudou = true;
}

const alvos = args.includes('--aprovados')
  ? readdirSync(RASC).filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''))
  : args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--cases-dir');

for (const nome of alvos) {
  const p = join(RASC, `${nome}.json`);
  if (!existsSync(p)) { console.error(`✗ ${nome}: rascunho não existe`); continue; }
  const r = JSON.parse(readFileSync(p, 'utf8'));
  if (nome.startsWith('case-')) { // cases publicam direto, sem revisão
    const { local, ...c } = r;
    cases = cases.filter((x) => x.id !== c.id).concat([c]);
    cases.sort((a, b) => String(b.atualizado || '').localeCompare(String(a.atualizado || '')));
    unlinkSync(p); console.log(`✓ ${nome} publicado em cases.json`); mudou = true; continue;
  }
  const rev = r.revisao || {};
  const motivo = rev.status !== 'aprovado' ? `revisao.status = "${rev.status}"` : !REVISOR.test(rev.revisor || '') ? 'revisor precisa ser e-mail @produtivajunior.com.br (ou a conta institucional)' : !ISO.test(rev.data || '') ? 'revisao.data precisa ser YYYY-MM-DD' : null;
  if (motivo) { if (!args.includes('--aprovados')) console.error(`✗ ${nome}: não promovido — ${motivo}`); continue; }
  if (r.pendencias && r.pendencias.length && r.status !== 'Em construção') console.log(`! ${nome}: aprovado com ${r.pendencias.length} pendência(s) registrada(s)`);

  const { origem, pendencias, modelo, modeloLegadoId, ...item } = r;
  item.origem = origem; // fica no acervo: é a trilha de auditoria por campo
  if (!item.revisao.proximaRevisao) item.revisao.proximaRevisao = maisMeses(rev.data, 3);
  if (pendencias && pendencias.length) item.pendencias = pendencias;

  if (nome.startsWith('escopo-')) {
    escopos = escopos.filter((e) => e.id !== item.id).concat([item]);
    const ordemGrupo = { 'PRODUÇÃO': 0, 'FINANCEIRO': 1, 'ESTRATÉGIA': 2 };
    escopos.sort((a, b) => (ordemGrupo[a.grupo] ?? 9) - (ordemGrupo[b.grupo] ?? 9) || (a.status === 'ativo' ? 0 : 1) - (b.status === 'ativo' ? 0 : 1) || a.nome.localeCompare(b.nome));
  } else {
    ferramentas = ferramentas.filter((f) => f.id !== item.id).concat([item]);
    ferramentas.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome));
    if (modelo) modelos = modelos.filter((m) => m.id !== modelo.id).concat([modelo]);
    if (modeloLegadoId) modelos = modelos.map((m) => m.id === modeloLegadoId ? { ...m, toolId: item.id } : m);
  }
  unlinkSync(p);
  console.log(`✓ ${nome} promovido (revisor ${rev.revisor}, ${rev.data})`);
  mudou = true;
}

if (mudou) {
  gravar('ferramentas', ferramentas); gravar('escopos', escopos); gravar('modelos', modelos); gravar('cases', cases);
  console.log('\nagora: node tools/pack.mjs && node tools/verify.mjs');
} else console.log('nada promovido.');
