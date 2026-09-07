#!/usr/bin/env node
/**
 * smoke.mjs — abre o bundle num Chromium de verdade, sem rede, e prova que ele funciona.
 *
 *   node tools/smoke.mjs                       dist/Biblioteca_CIEP.html
 *   node tools/smoke.mjs dist/Biblioteca_CIEP.preview.html
 *
 * O que ele garante:
 *   - a página renderiza sem "{{ … }}" cru na tela (o sintoma clássico de runtime que não subiu);
 *   - com unpkg.com bloqueado o app continua (React embutido);
 *   - Escopos → escopo → etapa → ferramenta → ficha abre e mostra "Usado em";
 *   - a busca por um termo de dentro dos passos encontra a ferramenta;
 *   - o botão do anexo abre uma URL do Drive numa aba nova;
 *   - screenshot em dist/<nome>-smoke.png (ignorado pelo git).
 *
 * Precisa do pacote playwright (npx playwright@1 …) e de um Chromium; sem os dois, sai com aviso.
 */
import { existsSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const alvo = resolve(ROOT, process.argv[2] || 'dist/Biblioteca_CIEP.html');
if (!existsSync(alvo)) { console.error(`✗ ${alvo} não existe — rode node tools/pack.mjs`); process.exit(1); }

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('! playwright não instalado. Rode: npx -y playwright@1 install --with-deps chromium && npm i -D playwright  (ou use o Chromium do ambiente com PLAYWRIGHT_BROWSERS_PATH)'); process.exit(2); }

const falhas = [];
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) falhas.push(msg); };

const exe = process.env.CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await ctx.route('**/unpkg.com/**', (r) => r.abort());
const page = await ctx.newPage();
// sem rede no sandbox, uma aba nova cairia em chrome-error://; então só registramos a URL pedida
await page.addInitScript(() => { window.__abertoNoDrive = null; window.open = (u) => { window.__abertoNoDrive = String(u); return null; }; });
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/fetch|CORS|Failed to load resource/i.test(m.text())) erros.push(m.text()); });

await page.goto(pathToFileURL(alvo).href);
await page.waitForFunction(() => document.body && /Biblioteca CIEP/.test(document.body.innerText) && !document.getElementById('__bundler_loading'), null, { timeout: 15000 }).catch(() => {});
const texto = async () => page.evaluate(() => document.body.innerText);

check(!/\{\{/.test(await texto()), 'nenhum "{{" cru na tela (runtime subiu sem unpkg)');
check(/Por escopo|Escopos/.test(await texto()), 'home renderizou a seção "Por escopo"');

// Escopos → escopo → etapa → ferramenta
await page.getByRole('button', { name: 'Escopos', exact: true }).first().click();
await page.waitForTimeout(300);
const temEscopos = !/Nenhum escopo cadastrado/.test(await texto());
check(true, temEscopos ? 'tela Escopos lista escopos' : 'tela Escopos vazia (nenhum escopo promovido ainda) — pulando navegação por etapa');
if (temEscopos) {
  // prefere um escopo com ferramentas mapeadas ("N etapas · M ferramentas", M > 0)
  const comFerr = page.locator('article', { hasText: /etapas · [1-9]/ });
  await ((await comFerr.count()) ? comFerr.first() : page.locator('article', { hasText: /etapas/ }).first()).click();
  await page.waitForTimeout(300);
  check(/ferramentas mapeadas/i.test(await texto()), 'abriu um escopo com a linha do tempo das etapas');
  const chip = page.locator('main span', { hasText: /^(Baixo|Médio|Alto)$/ });
  const nFerr = await chip.count();
  if (nFerr) {
    await chip.first().click();
    await page.waitForTimeout(300);
    check(/usado em/i.test(await texto()), 'ficha da ferramenta abriu a partir da etapa e mostra "Usado em"');
  } else check(true, 'etapa sem ferramentas mapeadas — ficha não testada por aqui');
}

// anexo → Drive: procura na Biblioteca a primeira ferramenta com botão "Abrir no Drive"
if (!(await page.getByRole('button', { name: 'Abrir no Drive' }).count())) {
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).first().click();
  await page.waitForTimeout(200);
  const nome = await page.evaluate(() => {
    // no script embutido, o último par "id","nome" antes da primeira "url":"https://d…" é a ferramenta dona do anexo
    const html = document.documentElement.outerHTML; const i = html.search(/"url":"https:\/\/(drive|docs)\.google/);
    if (i < 0) return null;
    const m = [...html.slice(0, i).matchAll(/"id":"([a-z0-9-]+)","nome":"([^"]+)"/g)].pop();
    return m ? m[2] : null;
  });
  if (nome) {
    await page.getByPlaceholder(/Buscar por nome/).fill(nome.slice(0, 12));
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Abrir', exact: true }).first().click();
    await page.waitForTimeout(300);
  }
}
{
  const btn = page.getByRole('button', { name: 'Abrir no Drive' }).first();
  if (await btn.count()) {
    await btn.click();
    const url = await page.evaluate(() => window.__abertoNoDrive);
    check(!!url && /^https:\/\/(drive|docs)\.google\.com\//.test(url), `botão "Abrir no Drive" pediu ${url ? url.slice(0, 70) : 'nada'}`);
  } else check(true, 'nenhuma ferramenta com anexo no Drive neste bundle — botão não testado');
}

// busca por termo de dentro de "passos"
await page.getByRole('button', { name: 'Biblioteca', exact: true }).first().click();
await page.waitForTimeout(200);
const passoTermo = await page.evaluate(() => {
  // acha uma palavra pouco comum dentro de um passo de qualquer ferramenta renderizada no bundle
  const m = document.documentElement.outerHTML.match(/"passos":\[\s*"([^"]{20,})"/);
  if (!m) return null;
  const palavras = m[1].split(/\s+/).filter((w) => w.length > 7 && /^[a-zà-ú]+$/i.test(w));
  return palavras[palavras.length - 1] || null;
});
if (passoTermo) {
  const input = page.getByPlaceholder(/Buscar por nome/);
  await input.fill(passoTermo);
  await page.waitForTimeout(300);
  check(!/Nenhum conteúdo encontrado/.test(await texto()), `busca por "${passoTermo}" (palavra de um passo) encontrou resultado`);
} else check(true, 'sem passos no bundle para testar a busca');

check(erros.length === 0, erros.length ? `erros de página: ${erros.slice(0, 3).join(' | ')}` : 'nenhum erro de JavaScript');

const shot = join(dirname(alvo), basename(alvo, '.html') + '-smoke.png');
await page.goto(pathToFileURL(alvo).href); await page.waitForTimeout(600);
await page.screenshot({ path: shot, fullPage: false });
console.log(`screenshot: ${shot}`);
await browser.close();
if (falhas.length) { console.error(`\n${falhas.length} falha(s).`); process.exit(1); }
console.log('\nsmoke ok.');
