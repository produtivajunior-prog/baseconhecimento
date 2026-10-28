#!/usr/bin/env node
/**
 * api-test.mjs — testa a função api/monitoramento.mjs sem rede: a API da Vercel é um dublê.
 *
 *   node tools/api-test.mjs
 *
 * Garante: sem variáveis → 503 dizendo o que falta; senha errada → 401; senha certa → resumo com
 * visitas reais separadas das visitas técnicas de tempo; token recusado → 502 com mensagem clara.
 */
const falhas = [];
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) falhas.push(msg); };

const pedidos = [];
let statusVercel = 200;
globalThis.fetch = async (url, opts) => {
  const u = new URL(url); pedidos.push({ u, auth: opts.headers.Authorization });
  if (statusVercel !== 200) return new Response('{}', { status: statusVercel });
  const by = u.searchParams.getAll('by'); const filtro = u.searchParams.get('filter') || '';
  let data;
  if (by[0] === 'environment') data = filtro ? [{ environment: 'production', pageviews: 120, visitors: 9 }] : [{ environment: 'production', pageviews: 200, visitors: 9 }, { environment: 'preview', pageviews: 10, visitors: 1 }];
  else if (by[0] === 'day' || by[0] === 'hour') data = [{ timestamp: '2026-10-27T13:00:00.000Z', pageviews: 30, visitors: 4 }, { timestamp: '2026-10-28T14:00:00.000Z', pageviews: 0, visitors: 0 }];
  else if (by.join() === 'requestPath,route') data = [
    { requestPath: '/_tempo/biblioteca', route: '/_tempo/1-3min', pageviews: 4, visitors: 3 },
    { requestPath: '/_tempo/biblioteca', route: '/_tempo/10-30s', pageviews: 2, visitors: 2 },
    { requestPath: '/_tempo/escopo', route: '/_tempo/3-10min', pageviews: 1, visitors: 1 },
    { requestPath: '/_tempo/escopo', route: '/_tempo/faixa-estranha', pageviews: 5, visitors: 1 }];
  else if (by[0] === 'requestPath') data = [{ requestPath: '/biblioteca', pageviews: 40, visitors: 8 }, { requestPath: '/escopo/estruturacao-comercial', pageviews: 12, visitors: 5 }];
  else data = [{ [by[0]]: 'x', pageviews: 5, visitors: 2 }, { [by[0]]: 'vazio', pageviews: 0, visitors: 0 }, { [by[0]]: 'Others', pageviews: 3, visitors: 1 }];
  return new Response(JSON.stringify({ data }), { status: 200 });
};

const { default: funcao } = await import('../api/monitoramento.mjs');
const pedir = (senha, dias = 7) => funcao.fetch(new Request(`https://hangar-produtiva.vercel.app/api/monitoramento?dias=${dias}`, { headers: senha == null ? {} : { 'x-hangar-senha': senha } }));

delete process.env.HANGAR_ADMIN_SENHA; delete process.env.HANGAR_ANALYTICS_TOKEN;
let r = await pedir('x'); let b = await r.json();
check(r.status === 503 && /HANGAR_ADMIN_SENHA e HANGAR_ANALYTICS_TOKEN/.test(b.erro) && pedidos.length === 0, `sem variáveis: 503 dizendo o que falta (${b.erro})`);

process.env.HANGAR_ADMIN_SENHA = 'senha-certa'; process.env.HANGAR_ANALYTICS_TOKEN = 'tok_teste';
r = await pedir('senha-errada'); b = await r.json();
check(r.status === 401 && b.erro === 'Senha incorreta.' && pedidos.length === 0, 'senha errada: 401 e nenhuma consulta à Vercel');
r = await pedir(null);
check(r.status === 401, 'sem senha: 401');

r = await pedir('senha-certa', 30); b = await r.json();
check(r.status === 200 && r.headers.get('cache-control') === 'no-store', 'senha certa: 200, sem cache');
check(b.periodo.dias === 30 && b.total.visitas === 120 && b.total.visitantes === 9, `totais só com visitas reais (${JSON.stringify(b.total)})`);
check(pedidos.every((p) => p.auth === 'Bearer tok_teste' && p.u.searchParams.get('projectId') === 'prj_O5YcMH5GRrFODV8WhyfDK5wKyDdm' && p.u.searchParams.get('teamId') === 'team_aLy3WIsPxT6oN5hiZy8L1qAu'), 'consultas usam o token e o projeto do Hangar');
const reais = pedidos.filter((p) => p.u.searchParams.get('filter') === "environment eq 'production' and not startswith(requestPath, '/_tempo')");
check(reais.length === 11, `visitas reais (só produção) filtram as técnicas de tempo (${reais.length} consultas)`);
check(pedidos.every((p) => p.u.pathname.endsWith('/aggregate')), 'nada usa /count (que arredonda para dias inteiros)');
check(pedidos.some((p) => p.u.searchParams.getAll('by').join() === 'requestPath,route' && p.u.searchParams.get('filter') === "environment eq 'production' and startswith(requestPath, '/_tempo')"), 'tempo consultado por tela × faixa');
check(b.usoMes.eventos === 210 && b.usoMes.limite === 50000, 'uso do mês conta todos os eventos (visitas + tempo, produção e prévias)');
check(b.porHora.length === 24 && b.porHora[10] === 30, 'horário convertido para Brasília (13h UTC → 10h)');
check(b.aparelhos.length === 2 && b.aparelhos[0].nome === 'x' && b.aparelhos[1].outros === true && b.aparelhos[1].nome === '', 'listas sem linhas zeradas e com "Others" marcado como outros');
const bib = b.tempo.telas.find((t) => t.tela === 'biblioteca');
check(b.tempo.n === 7 && bib && bib.n === 6 && bib.mediaSeg === Math.round((4 * 120 + 2 * 20) / 6), `tempo médio por faixa, ignorando faixa desconhecida (${JSON.stringify(b.tempo.telas)})`);
check(b.anterior.visitas === 120, 'período anterior para comparação');

pedidos.length = 0; r = await pedir('senha-certa', 999); b = await r.json();
check(b.periodo.dias === 7, 'período inválido cai para 7 dias');

statusVercel = 403; r = await pedir('senha-certa'); b = await r.json();
check(r.status === 502 && /token HANGAR_ANALYTICS_TOKEN foi recusado/.test(b.erro), 'token recusado: 502 com mensagem clara');

if (falhas.length) { console.error(`\n${falhas.length} falha(s).`); process.exit(1); }
console.log('\napi ok.');
