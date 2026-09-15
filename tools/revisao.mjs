#!/usr/bin/env node
/**
 * revisao.mjs — agenda do ritual trimestral de revisão do acervo, por dono.
 *
 *   node tools/revisao.mjs            o que está vencido e o que vence nos próximos 30 dias
 *   node tools/revisao.mjs --dias 60  outra janela
 *   node tools/revisao.mjs --tudo     todos os conteúdos, com a data de cada um
 *
 * Saída em Markdown, pronta para colar na mensagem trimestral do CIEP para os donos de área.
 * A data vem de revisao.proximaRevisao (3 meses depois da aprovação; tools/promover.mjs preenche).
 * Para renovar: o dono confere a fonte (node tools/rascunho.mjs --inventario mostra se o hash mudou),
 * ajusta o que precisa e atualiza revisao.data e revisao.proximaRevisao no JSON, ou repromove o rascunho.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (n) => JSON.parse(readFileSync(join(ROOT, `src/data/${n}.json`), 'utf8'));
const args = process.argv.slice(2);
const dias = args.includes('--dias') ? Number(args[args.indexOf('--dias') + 1]) || 30 : 30;
const tudo = args.includes('--tudo');
const hoje = new Date().toISOString().slice(0, 10);
const limite = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

const itens = [
  ...ler('ferramentas').filter((f) => f.revisao).map((f) => ({ ...f, tipoItem: f.tipo })),
  ...ler('escopos').map((e) => ({ ...e, tipoItem: 'Escopo' })),
].map((it) => ({ ...it, px: (it.revisao || {}).proximaRevisao || '' }));

const porDono = {};
for (const it of itens) {
  const email = (it.responsavel || {}).email || 'sem-dono';
  (porDono[email] = porDono[email] || { nome: (it.responsavel || {}).nome || email, vencidos: [], proximos: [], ok: [] });
  const g = porDono[email];
  if (!it.px) g.proximos.push(it);
  else if (it.px < hoje) g.vencidos.push(it);
  else if (it.px <= limite) g.proximos.push(it);
  else g.ok.push(it);
}
const linha = (it) => `- ${it.nome} (${it.tipoItem}) — ${it.px ? 'revisar até ' + it.px : 'sem data'}${it.status === 'Em construção' ? ' · em construção' : ''}`;
const nV = Object.values(porDono).reduce((n, g) => n + g.vencidos.length, 0);
const nP = Object.values(porDono).reduce((n, g) => n + g.proximos.length, 0);

console.log(`## Revisão trimestral do acervo — ${hoje}\n`);
console.log(`${itens.length} conteúdos com dono. **${nV} vencido(s)**, ${nP} vence(m) até ${limite}.\n`);
for (const [email, g] of Object.entries(porDono).sort((a, b) => (b[1].vencidos.length + b[1].proximos.length) - (a[1].vencidos.length + a[1].proximos.length))) {
  if (!tudo && !g.vencidos.length && !g.proximos.length) continue;
  console.log(`### ${g.nome} <${email}>`);
  if (g.vencidos.length) { console.log('Vencidos:'); g.vencidos.forEach((it) => console.log(linha(it))); }
  if (g.proximos.length) { console.log(`Vencem até ${limite}:`); g.proximos.forEach((it) => console.log(linha(it))); }
  if (tudo && g.ok.length) { console.log('Em dia:'); g.ok.forEach((it) => console.log(linha(it))); }
  console.log('');
}
if (!nV && !nP) console.log('Nada vencido nem a vencer na janela. Use --tudo para ver todas as datas.');
