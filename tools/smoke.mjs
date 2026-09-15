#!/usr/bin/env node
/**
 * smoke.mjs — abre o bundle num Chromium de verdade, sem rede, e prova que ele funciona.
 *
 *   node tools/smoke.mjs                       dist/Hangar.html
 *   node tools/smoke.mjs dist/Hangar.preview.html
 *
 * O que ele garante:
 *   - a página renderiza sem "{{ … }}" cru na tela (o sintoma clássico de runtime que não subiu);
 *   - com unpkg.com bloqueado o app continua (React embutido);
 *   - Escopos → escopo → etapa → ferramenta → ficha abre e mostra "Usado em";
 *   - a busca por um termo de dentro dos passos encontra a ferramenta;
 *   - o botão do anexo abre uma URL do Drive numa aba nova;
 *   - Banco de cases: cadastro com foto → publicar → ficha com capa, vídeo e documento → JSON → galeria após recarregar;
 *   - screenshot em dist/<nome>-smoke.png (ignorado pelo git).
 *
 * Precisa do pacote playwright (npx playwright@1 …) e de um Chromium; sem os dois, sai com aviso.
 */
import { existsSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const alvo = resolve(ROOT, process.argv[2] || 'dist/Hangar.html');
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
// em file:// o Chromium avisa sobre permissions policy do iframe do vídeo; é ruído, não erro do app
page.on('console', (m) => { if (m.type() === 'error' && !/fetch|CORS|Failed to load resource|permissions policy/i.test(m.text())) erros.push(m.text()); });

await page.goto(pathToFileURL(alvo).href);
await page.waitForFunction(() => document.body && /Hangar/.test(document.body.innerText) && !document.getElementById('__bundler_loading'), null, { timeout: 15000 }).catch(() => {});
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

// ---- banco de cases: cadastrar → publicar (localStorage) → buscar → ficha com vídeo → recarregar → JSON
await page.getByRole('button', { name: 'Cases', exact: true }).first().click();
await page.waitForTimeout(200);
check(/Banco de cases/i.test(await texto()), 'tela Cases abriu');
await page.getByRole('button', { name: /Cadastrar (o primeiro )?case/ }).first().click();
await page.waitForTimeout(200);
const preencher = async (placeholder, valor) => { const el = page.getByPlaceholder(placeholder).first(); await el.fill(valor); };
await preencher('Ex.: Picuí Pizzas', 'Padaria Smoke');
await preencher('Ex.: Alimentação, Contabilidade, Indústria', 'Alimentação');
await preencher('Ex.: Natal/RN', 'Natal/RN');
const escopoSel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Escolha o escopo' }) }).first();
const opcoes = await escopoSel.locator('option').allTextContents();
if (opcoes.length > 2) await escopoSel.selectOption({ index: 1 }); else await preencher('Descreva o escopo', 'Plano de Marketing');
const nomes = page.getByPlaceholder('Nome', { exact: true }); await nomes.nth(0).fill('Gerente Teste'); await nomes.nth(1).fill('Consultora Um'); await nomes.nth(2).fill('Consultor Dois');
await preencher('O que o cliente precisava e o que a Produtiva entregou.', 'A padaria não sabia o custo de cada produto. Montamos o custeio e o markup por item.');
await preencher(/Processo de pedidos reduzido/, 'Preço dos 12 produtos revisto com margem conhecida');
await preencher('Nome do arquivo', 'Relatório final.pdf');
await preencher('https://drive.google.com/…', 'https://drive.google.com/file/d/1abcDEF/view');
await preencher(/youtu\.be/, 'https://youtu.be/dQw4w9WgXcQ');
await page.waitForTimeout(200);
check((await page.locator('iframe[src*="youtube.com/embed/dQw4w9WgXcQ"]').count()) > 0, 'pré-visualização do vídeo (iframe) apareceu no formulário');
// foto: um PNG mínimo entra pelo input escondido; o app redimensiona no canvas e guarda como JPEG (data URL)
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
await page.locator('#hangar-foto-input').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG_1PX });
await page.waitForSelector('img[alt="Pré-visualização da foto"]', { timeout: 5000 }).catch(() => {});
const fotoPrev = await page.locator('img[alt="Pré-visualização da foto"]').first().getAttribute('src').catch(() => null);
check(!!fotoPrev && /^data:image\/jpeg;base64,/.test(fotoPrev), 'foto enviada virou pré-visualização JPEG (data URL) no formulário');
await page.getByPlaceholder('Ex.: Equipe com o gestor na entrega final').fill('Equipe na entrega');
await page.getByText('Seu nome *').locator('..').locator('input').fill('Pessoa do Smoke');
await page.getByRole('button', { name: 'Publicar no meu Hangar' }).click();
await page.waitForTimeout(400);
let t = await texto();
check(/Padaria Smoke/.test(t) && /Equipe do projeto/i.test(t), 'case publicado abriu a ficha');
check((await page.locator('iframe[src*="youtube.com/embed/"]').count()) > 0, 'ficha do case embute o vídeo');
check(/Relatório final\.pdf/.test(t) && /Abrir no Drive/.test(t), 'ficha lista o documento com botão do Drive');
check((await page.locator('main img[alt="Padaria Smoke"][src^="data:image/jpeg"]').count()) > 0 && /Equipe na entrega/.test(t), 'ficha mostra a foto de capa com a legenda');
check(/Só neste navegador/i.test(t), 'ficha avisa que o case só existe neste navegador');
await page.getByRole('button', { name: 'Baixar case (.json)' }).first().click();
await page.waitForTimeout(200);
const dl = await page.evaluate(() => window.__hangarUltimoDownload);
let caseJson = null; try { caseJson = dl && JSON.parse(dl.json); } catch {}
check(!!caseJson && caseJson.cliente === 'Padaria Smoke' && caseJson.equipe.consultores.length === 2 && /^case-.*\.json$/.test(dl.nome), `"Baixar case" gerou ${dl ? dl.nome : 'nada'} com JSON válido`);
check(!!caseJson && caseJson.foto && /^data:image\/jpeg;base64,/.test(caseJson.foto.url) && caseJson.foto.legenda === 'Equipe na entrega', 'JSON do case leva a foto embutida e a legenda');
// busca e persistência
await page.reload(); await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Cases', exact: true }).first().click(); await page.waitForTimeout(200);
await page.getByPlaceholder(/Cliente, segmento, escopo/).fill('smoke');
await page.waitForTimeout(300);
t = await texto();
check(/Padaria Smoke/.test(t) && !/Nenhum case encontrado/.test(t), 'após recarregar, a busca "smoke" encontra o case (localStorage)');
check((await page.locator('article img[alt="Padaria Smoke"]').count()) > 0, 'galeria mostra o case como foto com o nome embaixo');
await page.locator('article img[alt="Padaria Smoke"]').first().click(); await page.waitForTimeout(300);
check(/Equipe do projeto/i.test(await texto()), 'clicar na foto abre a ficha do case');
await page.getByRole('button', { name: 'Banco de cases' }).first().click(); await page.waitForTimeout(200);
await page.getByPlaceholder(/Cliente, segmento, escopo/).fill('smoke'); await page.waitForTimeout(300);
await page.getByPlaceholder(/Cliente, segmento, escopo/).fill('xyzinexistente'); await page.waitForTimeout(300);
check(/Nenhum case encontrado/.test(await texto()), 'busca sem resultado mostra a mensagem certa');
await page.evaluate(() => { try { localStorage.removeItem('hangar.casesLocais'); } catch {} });

check(erros.length === 0, erros.length ? `erros de página: ${erros.slice(0, 3).join(' | ')}` : 'nenhum erro de JavaScript');

const shot = join(dirname(alvo), basename(alvo, '.html') + '-smoke.png');
await page.goto(pathToFileURL(alvo).href); await page.waitForTimeout(600);
await page.screenshot({ path: shot, fullPage: false });
console.log(`screenshot: ${shot}`);
await browser.close();
if (falhas.length) { console.error(`\n${falhas.length} falha(s).`); process.exit(1); }
console.log('\nsmoke ok.');
