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
 *   - Como funciona a Produtiva: menu, áreas, subnúcleos, fluxo comercial e atalho para os escopos;
 *   - Escopos (PPGP 2026): busca, os 5 blocos do escopo, checklist "O que saber" após F5, roteiro imprimível,
 *     etapa → ferramenta → "Usado em", link antigo redirecionando e "+ ficha" preenchendo o cadastro de case;
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
check((await page.locator('#__bundler_err').count()) === 0, 'sem painel vermelho de erro do bundle na tela');
check(/Por escopo|Escopos/.test(await texto()), 'home renderizou a seção "Por escopo"');

// Como funciona a Produtiva: menu → página com as 5 áreas, subnúcleos, fluxo comercial → área de atuação abre Escopos
await page.getByRole('button', { name: 'Como funciona', exact: true }).first().click();
await page.waitForTimeout(300);
{
  const t = await texto();
  check(/#\/produtiva$/.test(await page.evaluate(() => location.hash)) && /Como funciona a Produtiva/.test(t), 'página "Como funciona a Produtiva" abriu pelo menu (#/produtiva)');
  check(['Gestão de Pessoas', 'Vice-presidência', 'Presidência', 'Marketing', 'Projetos'].every((x) => t.includes(x)) && ['CIEP', 'CIT', 'CSAT'].every((x) => t.includes(x)), 'página mostra as 5 áreas e os subnúcleos de Projetos');
  check(/SDR/.test(t) && /Closer/.test(t) && /Cronograma/.test(t) && /Proposta/.test(t), 'fluxo do primeiro contato ao projeto aparece (SDR → closer → gerente → proposta)');
  check(/Reembolso de gasolina/.test(t) && /Auxílio alimentação/.test(t) && /manhã e de tarde/.test(t) && /auxílios e reembolsos dos membros/.test(t), 'seção Auxílios e reembolsos aparece e a Vice-presidência paga auxílios e reembolsos');
  await page.locator('main article', { hasText: 'Gestão da Tecnologia' }).first().click(); await page.waitForTimeout(400);
  check(/#\/escopos$/.test(await page.evaluate(() => location.hash)) && /Automação/.test(await texto()), 'área de atuação "Gestão da Tecnologia" abre a tela Escopos');
}

// Escopos (PPGP 2026) → busca → escopo em 5 blocos → checklist → roteiro → etapa → ferramenta
await page.getByRole('button', { name: 'Escopos', exact: true }).first().click();
await page.waitForTimeout(300);
const temEscopos = !/Nenhum escopo cadastrado/.test(await texto());
check(true, temEscopos ? 'tela Escopos lista escopos' : 'tela Escopos vazia (nenhum escopo promovido ainda) — pulando navegação por etapa');
if (temEscopos) {
  const nCards = await page.locator('main article').count();
  check(/Revisão dos Escopos \(PPGP 2026\)/.test(await texto()) && nCards >= 16, `tela Escopos cita o PPGP 2026 e lista ${nCards} escopos`);
  const busca = page.getByPlaceholder(/Entregável, ferramenta, cliente/);
  await busca.fill('curva abc'); await page.waitForTimeout(300);
  const achados = await page.locator('main article').count();
  check(achados >= 1 && achados < nCards && /Gestão de Estoque/.test(await texto()), `busca "curva abc" nos escopos filtra para ${achados} escopo(s), com Gestão de Estoque`);
  await busca.fill(''); await page.waitForTimeout(200);

  await page.locator('main article', { hasText: 'Estruturação Comercial' }).first().click();
  await page.waitForTimeout(400);
  const t = await texto();
  check(['O que estudar', 'Diagnóstico Inicial', 'O que saber', 'Pontos de risco', 'Etapas do escopo', 'Entregáveis', 'Cases e cronogramas'].every((x) => t.includes(x)), 'escopo abriu com os 5 blocos (estudar, Diagnóstico Inicial, etapas, entregáveis, cases)');
  check(/Culpar a PJ por não vender/.test(t) && /Trópicos Motel/.test(t) && /Matriz de objeções/.test(t), 'risco, case e entregável do slide 2 do PPGP aparecem na tela');

  // checklist "O que saber": marca, conta e sobrevive ao F5
  await page.locator('main [role="checkbox"]').first().click(); await page.waitForTimeout(250);
  check(/1 de \d+ levantados/.test(await texto()), 'marcar uma pergunta de "O que saber" atualiza o contador');
  await page.reload(); await page.waitForTimeout(1200);
  check(/1 de \d+ levantados/.test(await texto()), 'checklist continua marcado depois de recarregar (localStorage)');
  await page.getByRole('button', { name: 'Limpar', exact: true }).first().click(); await page.waitForTimeout(200);

  // roteiro do Diagnóstico Inicial
  await page.getByRole('button', { name: /Roteiro do Diagnóstico Inicial/ }).click(); await page.waitForTimeout(300);
  {
    const mat = await page.evaluate(() => window.__hangarUltimoMaterial);
    check(!!mat && /roteiro do Diagnóstico Inicial/i.test(mat.html) && mat.html.includes('Culpar a PJ por não vender') && mat.html.includes('Quantas pessoas da equipe comercial'), `roteiro imprimível traz o que saber e os riscos (${mat ? mat.nome : 'nada'})`);
    await page.evaluate(() => { window.__abertoNoDrive = null; });
  }

  // etapa → ferramenta → "Usado em"
  const chip = page.locator('main span', { hasText: /^(Baixo|Médio|Alto)$/ });
  if (await chip.count()) {
    await chip.first().click();
    await page.waitForTimeout(300);
    check(/usado em/i.test(await texto()) && /Estruturação Comercial/.test(await texto()), 'ficha da ferramenta abriu a partir da etapa e mostra "Usado em" com o escopo');
  } else check(false, 'Estruturação Comercial sem ferramentas nas etapas');

  // link antigo de escopo fundido redireciona; frentes aparecem na linha do tempo
  await page.evaluate(() => { location.hash = '#/escopo/gamificacao'; }); await page.waitForTimeout(500);
  check(/cultura-gamificacao-prosel/.test(await page.evaluate(() => location.hash)) && /Frente: Gamificação/i.test(await texto()), 'link antigo #/escopo/gamificacao abre Cultura, Gamificação e Prosel com as frentes');

  // "+ ficha" de um projeto já realizado abre o cadastro com cliente e escopo preenchidos
  await page.getByRole('button', { name: '+ ficha' }).first().click(); await page.waitForTimeout(300);
  const cli = await page.locator('main input').first().inputValue();
  check(/cases\/novo/.test(await page.evaluate(() => location.hash)) && cli === 'Spicy', `"+ ficha" abre o cadastro de case com o cliente preenchido (${cli})`);
  await page.getByRole('button', { name: 'Limpar', exact: true }).last().click(); await page.waitForTimeout(200);
}

// material para a reunião: ficha da primeira ferramenta → abre uma aba (blob:) com o HTML imprimível
await page.getByRole('button', { name: 'Biblioteca', exact: true }).first().click(); await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Abrir', exact: true }).first().click(); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Abrir material para imprimir' }).first().click(); await page.waitForTimeout(300);
{
  const aba = await page.evaluate(() => window.__abertoNoDrive);
  const mat = await page.evaluate(() => window.__hangarUltimoMaterial);
  const nomeFerr = await page.locator('main h1').first().innerText();
  check(!!aba && /^blob:/.test(aba), 'material da reunião abriu numa aba nova (blob:)');
  check(!!mat && mat.html.includes(nomeFerr.trim()) && /material para a reunião/i.test(mat.html) && /Cliente:/.test(mat.html), `material traz o nome da ferramenta e os campos da reunião (${mat ? mat.nome : 'nada'})`);
  await page.evaluate(() => { window.__abertoNoDrive = null; });
}

// anexo → Drive: procura na Biblioteca a primeira ferramenta com botão "Abrir no Drive"
if (!(await page.getByRole('link', { name: 'Abrir no Drive' }).count())) {
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
  // <a href> de verdade: no artifact o window.open não abre para a maioria dos visitantes
  const link = page.getByRole('link', { name: 'Abrir no Drive' }).first();
  if (await link.count()) {
    const url = await link.getAttribute('href'); const alvo = await link.getAttribute('target');
    check(!!url && /^https:\/\/(drive|docs)\.google\.com\//.test(url) && alvo === '_blank', `anexo "Abrir no Drive" é link real para ${url ? url.slice(0, 70) : 'nada'} (nova aba)`);
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

// ---- comece aqui: trilha marcável (localStorage) + glossário com busca
await page.getByRole('button', { name: 'Comece aqui', exact: true }).first().click(); await page.waitForTimeout(300);
check(/Seu primeiro projeto/i.test(await texto()) && /Glossário/i.test(await texto()), 'tela "Comece aqui" abriu com a trilha e o glossário');
await page.getByTitle('Marcar como feito').first().click(); await page.waitForTimeout(200);
check(/1 de \d/.test(await texto()), 'marcar um passo da trilha atualiza o progresso');
await page.reload(); await page.waitForTimeout(1200);
check(/^#\/comece/.test(await page.evaluate(() => location.hash)) && /1 de \d/.test(await texto()), 'após recarregar, a trilha continua na tela e com o passo marcado');
await page.getByPlaceholder(/Buscar sigla/).fill('rac'); await page.waitForTimeout(250);
check(/\bRAC\b/.test(await texto()) && !/\bPMMC\b.*Process Map/s.test(await texto()), 'busca do glossário filtra os termos');
await page.evaluate(() => { try { localStorage.removeItem('hangar.trilha'); } catch {} });

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
await page.getByPlaceholder('84 99999-0000').nth(0).fill('(84) 99999-0000');
await preencher('O que o cliente precisava e o que a Produtiva entregou.', 'A padaria não sabia o custo de cada produto. Montamos o custeio e o markup por item.');
await preencher(/Processo de pedidos reduzido/, 'Preço dos 12 produtos revisto com margem conhecida');
await preencher('Nome do arquivo', 'Relatório final.pdf');
await preencher('https://drive.google.com/…', 'https://drive.google.com/file/d/1abcDEF/view');
// segundo documento: PDF anexado direto (sem Drive), pelo botão "Anexar PDF"
await page.getByRole('button', { name: '+ Adicionar documento' }).click();
await page.waitForTimeout(150);
await page.getByPlaceholder('Nome do arquivo').nth(1).fill('Proposta.pdf');
await page.getByRole('button', { name: 'Anexar PDF' }).nth(1).click();
await page.waitForTimeout(100);
const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Size 1/Root 1 0 R>>\n%%EOF', 'utf-8');
await page.locator('#hangar-doc-pdf-1').setInputFiles({ name: 'proposta.pdf', mimeType: 'application/pdf', buffer: PDF_MINIMO });
await page.waitForTimeout(200);
check(/PDF anexado/.test(await texto()), 'anexar PDF direto mostra o chip "PDF anexado" no formulário');
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
{
  const link = page.getByRole('link', { name: 'Abrir no Drive' }).first();
  check((await link.getAttribute('href')) === 'https://drive.google.com/file/d/1abcDEF/view' && (await link.getAttribute('target')) === '_blank', 'documento do case é link real (<a href>) para o Drive, em nova aba');
}
check(/Proposta\.pdf/.test(t) && /Abrir PDF/.test(t), 'ficha lista o PDF anexado com o rótulo "Abrir PDF"');
{
  await page.getByRole('button', { name: 'Abrir PDF' }).first().click();
  await page.waitForTimeout(200);
  const url = await page.evaluate(() => window.__abertoNoDrive);
  check(!!url && /^blob:/.test(url), `"Abrir PDF" abre um blob: (não um data: bloqueado pelo Chrome) — ${url ? url.slice(0, 24) : 'nada'}`);
  await page.evaluate(() => { window.__abertoNoDrive = null; });
}
check((await page.locator('main img[alt="Padaria Smoke"][src^="data:image/jpeg"]').count()) > 0 && /Equipe na entrega/.test(t), 'ficha mostra a foto de capa com a legenda');
check(/Só neste navegador/i.test(t), 'ficha avisa que o case só existe neste navegador');
check(/Pergunte a quem fez/.test(t), 'ficha tem o bloco "Pergunte a quem fez"');
{
  const url = await page.getByRole('link', { name: 'WhatsApp' }).first().getAttribute('href');
  check(!!url && /^https:\/\/wa\.me\/5584999990000\?text=/.test(url) && /Padaria/.test(decodeURIComponent(url)), `link WhatsApp aponta para wa.me com a mensagem do case (${url ? url.slice(0, 48) : 'nada'})`);
}
await page.getByRole('button', { name: 'Baixar case (.json)' }).first().click();
await page.waitForTimeout(200);
const dl = await page.evaluate(() => window.__hangarUltimoDownload);
let caseJson = null; try { caseJson = dl && JSON.parse(dl.json); } catch {}
check(!!caseJson && caseJson.cliente === 'Padaria Smoke' && caseJson.equipe.consultores.length === 2 && /^case-.*\.json$/.test(dl.nome), `"Baixar case" gerou ${dl ? dl.nome : 'nada'} com JSON válido`);
check(!!caseJson && caseJson.foto && /^data:image\/jpeg;base64,/.test(caseJson.foto.url) && caseJson.foto.legenda === 'Equipe na entrega', 'JSON do case leva a foto embutida e a legenda');
check(!!caseJson && caseJson.equipe.gerente.whatsapp === '84999990000', 'JSON do case guarda o WhatsApp só com dígitos');
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
check(/^#\/case\//.test(await page.evaluate(() => location.hash)), `URL acompanha a tela (${await page.evaluate(() => location.hash)})`);
await page.goBack(); await page.waitForTimeout(400);
check(/Banco de cases/i.test(await texto()) && !/Equipe do projeto/i.test(await texto()), 'botão "voltar" do navegador volta para a lista de cases');
await page.evaluate(() => { location.hash = '#/biblioteca'; }); await page.waitForTimeout(400);
check(/^Biblioteca/m.test(await texto()) || (await page.getByPlaceholder(/Buscar por nome/).count()) > 0, 'mudar o hash na URL troca de tela (#/biblioteca)');
await page.keyboard.press('/'); await page.waitForTimeout(100);
check(await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'INPUT'), 'tecla "/" foca a busca');
await page.getByRole('button', { name: 'Cases', exact: true }).first().click(); await page.waitForTimeout(300);
await page.getByPlaceholder(/Cliente, segmento, escopo/).fill('smoke'); await page.waitForTimeout(300);
await page.getByPlaceholder(/Cliente, segmento, escopo/).fill('xyzinexistente'); await page.waitForTimeout(300);
check(/Nenhum case encontrado/.test(await texto()), 'busca sem resultado mostra a mensagem certa');
// remover case: pede confirmação, cancelar mantém, confirmar apaga do localStorage
await page.getByPlaceholder(/Cliente, segmento, escopo/).fill('smoke'); await page.waitForTimeout(300);
await page.locator('article img[alt="Padaria Smoke"]').first().click(); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Remover case' }).click(); await page.waitForTimeout(200);
t = await texto();
check(/Remover case\?/.test(t) && /Padaria Smoke/.test(t), 'confirmação de remoção mostra o nome do cliente');
await page.getByRole('button', { name: 'Cancelar' }).click(); await page.waitForTimeout(200);
check(!/Remover case\?/.test(await texto()) && /Equipe do projeto/i.test(await texto()), 'cancelar fecha o modal e mantém o case');
await page.getByRole('button', { name: 'Remover case' }).click(); await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Remover', exact: true }).click(); await page.waitForTimeout(300);
t = await texto();
check(/Banco de cases/i.test(t) && !/Equipe do projeto/i.test(t), 'confirmar remoção volta para a lista de cases');
check(/removido deste navegador/i.test(t), 'toast confirma a remoção');
const casesLocaisPos = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('hangar.casesLocais') || '[]'); } catch { return null; } });
check(Array.isArray(casesLocaisPos) && casesLocaisPos.length === 0, 'case removido some do localStorage');
await page.evaluate(() => { try { localStorage.removeItem('hangar.casesLocais'); } catch {} });

check(erros.length === 0, erros.length ? `erros de página: ${erros.slice(0, 3).join(' | ')}` : 'nenhum erro de JavaScript');

const shot = join(dirname(alvo), basename(alvo, '.html') + '-smoke.png');
await page.goto(pathToFileURL(alvo).href); await page.waitForTimeout(600);
await page.screenshot({ path: shot, fullPage: false });
console.log(`screenshot: ${shot}`);
await browser.close();
if (falhas.length) { console.error(`\n${falhas.length} falha(s).`); process.exit(1); }
console.log('\nsmoke ok.');
