#!/usr/bin/env node
/**
 * aprovar.mjs — registra a aprovação de rascunhos (src/data/rascunhos/*.json) com trilha de quem aprovou.
 *
 *   node tools/aprovar.mjs pmmc swot --revisor voce@produtivajunior.com.br
 *   node tools/aprovar.mjs --todos --revisor voce@produtivajunior.com.br --nota "Conferido contra o PDF"
 *   node tools/aprovar.mjs --escopos --revisor ...        só os escopo-*.json
 *   node tools/aprovar.mjs --ferramentas --revisor ...    só as ferramentas
 *
 * Não altera conteúdo: só preenche revisao = { status: "aprovado", revisor, data, proximaRevisao, nota }.
 * proximaRevisao = 3 meses depois (ritual trimestral). Antes de aprovar, o script mostra o que cada
 * rascunho ainda tem em pendencias, para a aprovação ser consciente. Depois:
 *   node tools/promover.mjs --aprovados && node tools/pack.mjs && node tools/verify.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RASC = join(ROOT, 'src/data/rascunhos');
const REVISOR = /^[^@\s]+@produtivajunior\.com\.br$|^produtivajunior@gmail\.com$/;
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : '');
const revisor = opt('--revisor');
const nota = opt('--nota');
const hoje = new Date().toISOString().slice(0, 10);
const maisMeses = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

if (!REVISOR.test(revisor)) { console.error('uso: node tools/aprovar.mjs <ids…> | --todos | --escopos | --ferramentas  --revisor <e-mail @produtivajunior.com.br> [--nota "…"]'); process.exit(1); }

const todos = readdirSync(RASC).filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''));
const alvos = args.includes('--todos') ? todos
  : args.includes('--escopos') ? todos.filter((n) => n.startsWith('escopo-'))
  : args.includes('--ferramentas') ? todos.filter((n) => !n.startsWith('escopo-') && !n.startsWith('case-'))
  : args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--revisor' && args[i - 1] !== '--nota');
if (!alvos.length) { console.error('nenhum rascunho selecionado'); process.exit(1); }

let n = 0;
for (const nome of alvos) {
  const p = join(RASC, `${nome}.json`);
  if (!existsSync(p)) { console.error(`✗ ${nome}: rascunho não existe`); continue; }
  const r = JSON.parse(readFileSync(p, 'utf8'));
  if (nome.startsWith('case-')) { console.log(`· ${nome}: cases não passam por revisão (use tools/promover.mjs)`); continue; }
  const pend = (r.pendencias || []).length;
  r.revisao = { status: 'aprovado', revisor, data: hoje, proximaRevisao: maisMeses(hoje, 3), ...(nota ? { nota } : {}) };
  writeFileSync(p, JSON.stringify(r, null, 2) + '\n');
  n++;
  console.log(`✓ ${nome}${r.status ? ' (' + r.status + ')' : ''}${pend ? ` — aprovado com ${pend} pendência(s) registrada(s)` : ''}`);
}
console.log(`\n${n} rascunho(s) aprovado(s) por ${revisor} em ${hoje}; próxima revisão em ${maisMeses(hoje, 3)}.`);
console.log('agora: node tools/promover.mjs --aprovados && node tools/pack.mjs && node tools/verify.mjs');
