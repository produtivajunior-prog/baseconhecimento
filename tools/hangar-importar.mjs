#!/usr/bin/env node
/**
 * hangar-importar.mjs — transforma o hangar-academy.txt (gerado por tools/hangar-extrator.js no
 * navegador) em fontes/hangar/<id>.md, no formato que tools/rascunho.mjs entende.
 *
 *   node tools/hangar-importar.mjs ~/Downloads/hangar-academy.txt --por seu@produtivajunior.com.br
 *
 * Para cada página: casa o título com uma ferramenta de fontes/ferramentas-mapa.json (nome ou id);
 * se casar, grava fontes/hangar/<id>.md com as seções normalizadas (## O que é, ## Quando usar,
 * ## Passo a passo, ## Perguntas-chave, ## Cuidados, ## Casos reais, ## Template padrão); se não,
 * grava em fontes/hangar/paginas/<slug>.md para leitura. Nada é inventado: o texto é o da página.
 * Depois: node tools/rascunho.mjs --ferramentas  (o rascunho ganha origem hangar:<id>#<seção>).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--'));
const por = args.includes('--por') ? args[args.indexOf('--por') + 1] : '';
if (!arquivo || !/^[^@\s]+@produtivajunior\.com\.br$/.test(por || '')) { console.error('uso: node tools/hangar-importar.mjs <hangar-academy.txt> --por <seu e-mail @produtivajunior.com.br>'); process.exit(1); }

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = (t) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mapa = JSON.parse(readFileSync(join(ROOT, 'fontes/ferramentas-mapa.json'), 'utf8')).ferramentas;
const hoje = new Date().toISOString().slice(0, 10);

// seções que o rascunho.mjs reconhece, com os títulos que costumam aparecer no site
const SECOES = [
  ['O que é', /^(o que e|o que e a|o que e o|definicao|sobre|introducao|conceito)\b/],
  ['Quando usar', /^(quando usar|quando aplicar|aplicacao|para que serve|objetivo)\b/],
  ['Quando não usar', /^(quando nao usar|quando nao aplicar|limitacoes)\b/],
  ['Passo a passo', /^(passo a passo|como fazer|como aplicar|como usar|etapas|metodologia)\b/],
  ['Perguntas-chave', /^(perguntas|perguntas-chave|perguntas chave|roteiro)\b/],
  ['Cuidados', /^(cuidados|erros comuns|dicas|atencao|boas praticas)\b/],
  ['Casos reais', /^(casos reais|exemplos|cases|aplicacoes em clientes)\b/],
  ['Template padrão', /^(template|templates|modelo|modelos|material|arquivos|anexos)\b/],
];
const normalizarSecoes = (corpo) => {
  const naoMapeadas = [];
  const out = corpo.split('\n').map((l) => {
    const h = /^##\s+(.+)$/.exec(l);
    if (!h) return l;
    const t = norm(h[1]).trim();
    const sec = SECOES.find(([, re]) => re.test(t));
    if (!sec) naoMapeadas.push(h[1].trim());
    return sec ? `## ${sec[0]}` : l;
  }).join('\n');
  return { corpo: out, naoMapeadas };
};
const casar = (titulo) => {
  const t = norm(titulo);
  return mapa.find((f) => f.id === slug(titulo)) || mapa.find((f) => norm(f.nome) === t) ||
    mapa.find((f) => t.includes(norm(f.nome).replace(/\s*\(.*\)$/, ''))) || mapa.find((f) => { const m = /\(([^)]+)\)/.exec(f.nome); return m && t === norm(m[1]); }) || null;
};

const bruto = readFileSync(arquivo, 'utf8');
const blocos = bruto.split(/^===== PAGE: /m).slice(1);
mkdirSync(join(ROOT, 'fontes/hangar/paginas'), { recursive: true });
let mapeadas = 0;
for (const b of blocos) {
  const [cab, ...resto] = b.split('\n---\n');
  const [url, ...meta] = cab.split('\n');
  const titulo = (meta.find((l) => l.startsWith('titulo:')) || 'titulo:').slice(7).trim() || decodeURIComponent(url.trim().split('/').pop());
  const { corpo, naoMapeadas } = normalizarSecoes(resto.join('\n---\n').trim());
  const f = casar(titulo);
  const front = `---\nurl: ${url.trim()}\ntitulo: ${titulo}\ncoladoPor: ${por}\ndata: ${hoje}\n---\n\n`;
  if (f) {
    writeFileSync(join(ROOT, 'fontes/hangar', `${f.id}.md`), front + corpo + '\n');
    mapeadas++;
    console.log(`✓ ${titulo} → fontes/hangar/${f.id}.md${naoMapeadas.length ? `  (seções sem mapa: ${naoMapeadas.join(', ')})` : ''}`);
  } else {
    writeFileSync(join(ROOT, 'fontes/hangar/paginas', `${slug(titulo) || 'pagina'}.md`), front + corpo + '\n');
    console.log(`· ${titulo} → fontes/hangar/paginas/${slug(titulo) || 'pagina'}.md (não é uma ferramenta do mapa)`);
  }
}
console.log(`\n${blocos.length} página(s); ${mapeadas} casaram com ferramentas. Agora: node tools/rascunho.mjs --ferramentas`);
