// Monitoramento do Hangar (só administradores): função da Vercel que lê o Vercel Web Analytics
// com um token guardado no projeto e devolve um resumo para a tela #/monitoramento.
//
// Variáveis do projeto na Vercel (Settings → Environment Variables):
//   HangarAdmin           senha que a tela pede (enviada no cabeçalho x-hangar-senha)
//   HangarMonitoramento   token da Vercel com acesso ao time "pj" (vercel.com/account/settings/tokens)
// Os nomes antigos (HANGAR_ADMIN_SENHA, HANGAR_ANALYTICS_TOKEN) e variações em maiúsculas também valem.
//
// O tempo em cada tela chega como visita técnica: caminho /_tempo/<tela>, rota /_tempo/<faixa> (ver contarTempo em src/app.js).
import { createHash, timingSafeEqual } from 'node:crypto';

// Primeiro nome preenchido vence; os nomes são os que a diretoria cadastrou na Vercel.
const NOMES_SENHA = ['HangarAdmin', 'HANGAR_ADMIN', 'HANGAR_ADMIN_SENHA', 'HangarAdminSenha'];
const NOMES_TOKEN = ['HangarMonitoramento', 'HANGAR_MONITORAMENTO', 'hangar_monitoramento', 'HANGAR_ANALYTICS_TOKEN', 'HangarToken', 'HANGAR_TOKEN'];
const variavel = (nomes) => { for (const n of nomes) { const v = (process.env[n] || '').trim(); if (v) return v; } return ''; };
const PROJETO = process.env.HANGAR_PROJECT_ID || 'prj_O5YcMH5GRrFODV8WhyfDK5wKyDdm';
const TIME = process.env.HANGAR_TEAM_ID || 'team_aLy3WIsPxT6oN5hiZy8L1qAu';
const API = 'https://api.vercel.com/v1/query/web-analytics/visits';
// Só produção: as prévias (*.vercel.app de cada branch) também contam visitas, mas não são uso real.
const PROD = "environment eq 'production'";
const TEMPO = `${PROD} and startswith(requestPath, '/_tempo')`;
const REAIS = `${PROD} and not startswith(requestPath, '/_tempo')`;
const LIMITE_MES = 50000; // eventos/mês incluídos no plano Hobby (visitas + visitas técnicas de tempo)
// Faixas de tempo e o ponto médio (s) usado no tempo médio aproximado; a última tem teto de 40 min.
export const FAIXAS = { '3-10s': 6, '10-30s': 20, '30s-1min': 45, '1-3min': 120, '3-10min': 390, '10-30min': 1200, '30min+': 2400 };

const json = (status, corpo) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const resumo = (s) => createHash('sha256').update(String(s)).digest();
const senhaOk = (dada, certa) => timingSafeEqual(resumo(dada), resumo(certa));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Erro da API com o status e a mensagem que a Vercel devolveu (vai para a tela, que só abre com a senha certa).
async function falha(r) {
  let detalhe = ''; try { const b = await r.json(); detalhe = (b && b.error && (b.error.message || b.error.code)) || (b && b.message) || ''; } catch { /* corpo sem JSON */ }
  const e = new Error(`Vercel ${r.status}${detalhe ? ': ' + detalhe : ''}`); e.status = r.status; e.detalhe = String(detalhe).slice(0, 200); return e;
}
// Em qual time está o projeto: o configurado; senão, os times que o token enxerga; senão, a conta pessoal.
// Fica guardado enquanto a função estiver quente. Cobre token criado com outro escopo e time renomeado.
// As 13 consultas rodam juntas: todas esperam a mesma descoberta (promessa guardada por token).
let escopo = null;
function descobrirEscopo(token) {
  if (escopo && escopo.token === token) return escopo.promessa;
  const promessa = acharEscopo(token).catch((e) => { escopo = null; throw e; });
  escopo = { token, promessa };
  return promessa;
}
async function acharEscopo(token) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const tenta = async (teamId) => {
    for (const projeto of [PROJETO, 'hangar-produtiva']) {
      const r = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projeto)}${teamId ? '?teamId=' + encodeURIComponent(teamId) : ''}`, auth);
      if (r.ok) { const p = await r.json(); return { projectId: p.id || projeto, teamId: teamId || null }; }
      if (r.status === 401) throw await falha(r);
    }
    return null;
  };
  let achado = await tenta(TIME);
  if (!achado) {
    const r = await fetch('https://api.vercel.com/v2/teams?limit=50', auth);
    if (r.status === 401 || r.status === 403) throw await falha(r); // token inválido ou vencido
    const times = r.ok ? ((await r.json()).teams || []) : [];
    for (const t of times) { if (t.id !== TIME && (achado = await tenta(t.id))) break; }
  }
  if (!achado) achado = await tenta(null);
  if (!achado) { const e = new Error('projeto não encontrado'); e.status = 404; e.semProjeto = true; throw e; }
  return achado;
}

async function consulta(token, tipo, params) {
  const { projectId, teamId } = await descobrirEscopo(token);
  const url = new URL(`${API}/${tipo}`);
  for (const [k, v] of Object.entries({ projectId, teamId, ...params })) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x)); else if (v != null) url.searchParams.set(k, String(v));
  }
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw await falha(r);
  return (await r.json()).data;
}
// O endpoint /count arredonda o período para dias inteiros (deixaria o dia de hoje de fora);
// agrupar por ambiente dá o total do período com precisão de hora e visitantes únicos.
async function totais(token, params) {
  const linhas = await consulta(token, 'aggregate', { ...params, by: 'environment', limit: 5 });
  return (linhas || []).reduce((a, l) => ({ pageviews: a.pageviews + (l.pageviews || 0), visitors: a.visitors + (l.visitors || 0) }), { pageviews: 0, visitors: 0 });
}

// Horas em São Paulo (UTC−3, sem horário de verão desde 2019)
const horaSP = (iso) => (new Date(iso).getUTCHours() + 21) % 24;

export function montarTempo(linhas) {
  const porTela = {}; const porFaixa = {}; let soma = 0; let n = 0;
  for (const l of linhas || []) {
    const tela = String(l.requestPath || '').replace(/^\/_tempo\/?/, '') || 'inicio';
    const faixa = String(l.route || '').replace(/^\/_tempo\/?/, '');
    const seg = FAIXAS[faixa]; const q = Number(l.pageviews) || 0;
    if (!seg || !q) continue;
    const t = (porTela[tela] = porTela[tela] || { tela, n: 0, soma: 0 });
    t.n += q; t.soma += seg * q; porFaixa[faixa] = (porFaixa[faixa] || 0) + q; soma += seg * q; n += q;
  }
  return {
    n, mediaSeg: n ? Math.round(soma / n) : 0,
    telas: Object.values(porTela).map((t) => ({ tela: t.tela, n: t.n, mediaSeg: Math.round(t.soma / t.n) })).sort((a, b) => b.n - a.n),
    faixas: Object.keys(FAIXAS).map((faixa) => ({ faixa, n: porFaixa[faixa] || 0 })),
  };
}

async function responder(request) {
  const certa = variavel(NOMES_SENHA); const token = variavel(NOMES_TOKEN);
  if (!certa || !token) {
    const faltam = [!certa && 'a senha (HangarAdmin)', !token && 'o token (HangarMonitoramento)'].filter(Boolean).join(' e ');
    return json(503, { erro: `Monitoramento ainda não configurado: falta ${faltam} nas variáveis do projeto na Vercel.` });
  }
  if (!senhaOk(request.headers.get('x-hangar-senha') || '', certa)) { await esperar(800); return json(401, { erro: 'Senha incorreta.' }); }

  const dias = [1, 7, 30].includes(Number(new URL(request.url).searchParams.get('dias'))) ? Number(new URL(request.url).searchParams.get('dias')) : 7;
  const agora = new Date(); const ate = agora.toISOString();
  const desde = new Date(agora - dias * 864e5).toISOString(); const antes = new Date(agora - 2 * dias * 864e5).toISOString();
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
  const periodo = { since: desde, until: ate };
  const por = (dim, limit, filter = REAIS) => consulta(token, 'aggregate', { ...periodo, by: [].concat(dim), limit, filter });
  // A Vercel aceita no máximo 168 h por consulta hora a hora (e arredonda o fim para a hora seguinte):
  // o horário de uso vem em blocos de 6 dias, presos na hora cheia e sem sobreposição, somados depois.
  const porHoraEmBlocos = async () => {
    const BLOCO = 144 * 36e5; const fim = agora.getTime();
    let ini = Math.floor(new Date(desde).getTime() / 36e5) * 36e5; const blocos = [];
    while (ini < fim) { const ate = Math.min(ini + BLOCO, fim); blocos.push({ since: new Date(ini).toISOString(), until: new Date(ate - 1).toISOString() }); ini += BLOCO; }
    const partes = await Promise.all(blocos.map((b) => consulta(token, 'aggregate', { ...b, by: ['hour'], filter: REAIS })));
    return partes.flat();
  };

  try {
    const [total, anterior, serie, horas, paginas, telas, aparelhos, navegadores, sistemas, paises, origens, tempo, mes] = await Promise.all([
      totais(token, { ...periodo, filter: REAIS }),
      totais(token, { since: antes, until: desde, filter: REAIS }),
      por(dias === 1 ? 'hour' : 'day'),
      porHoraEmBlocos(),
      por('requestPath', 100),
      por('route', 30),
      por('deviceType', 5),
      por('browserName', 6),
      por('osName', 6),
      por('country', 6),
      por('referrerHostname', 8),
      por(['requestPath', 'route'], 100, TEMPO),
      totais(token, { since: inicioMes, until: ate }),
    ]);
    // Acima do limite a Vercel junta o resto numa linha "Others": vai como { outros: true }.
    const lista = (linhas, chave) => (linhas || []).filter((l) => l.pageviews).map((l) => (l[chave] === 'Others'
      ? { nome: '', outros: true, visitas: l.pageviews, visitantes: l.visitors } : { nome: l[chave] || '', visitas: l.pageviews, visitantes: l.visitors }));
    const porHora = Array(24).fill(0); for (const h of horas || []) porHora[horaSP(h.timestamp)] += h.pageviews || 0;
    return json(200, {
      periodo: { dias, desde, ate },
      total: { visitas: total.pageviews || 0, visitantes: total.visitors || 0 },
      anterior: { visitas: anterior.pageviews || 0, visitantes: anterior.visitors || 0 },
      serie: (serie || []).map((p) => ({ t: p.timestamp, visitas: p.pageviews || 0, visitantes: p.visitors || 0 })),
      porHora,
      paginas: lista(paginas, 'requestPath'), telas: lista(telas, 'route'),
      aparelhos: lista(aparelhos, 'deviceType'), navegadores: lista(navegadores, 'browserName'), sistemas: lista(sistemas, 'osName'),
      paises: lista(paises, 'country'), origens: lista(origens, 'referrerHostname'),
      tempo: montarTempo(tempo),
      usoMes: { eventos: mes.pageviews || 0, limite: LIMITE_MES, desde: inicioMes },
    });
  } catch (e) {
    console.error('monitoramento:', e && e.message);
    const detalhe = e && e.detalhe ? ` (${e.status}: ${e.detalhe})` : e && e.status ? ` (${e.status})` : '';
    const msg = e.semProjeto ? 'O token HangarMonitoramento não enxerga o projeto hangar-produtiva. Crie o token com Scope no time onde o projeto está (pj) e troque o valor da variável.'
      : e.status === 401 || e.status === 403 ? `O token HangarMonitoramento foi recusado pela Vercel (vencido ou sem acesso ao time pj)${detalhe}.`
      : e.status === 402 ? `A Vercel pediu um plano pago para esta consulta${detalhe}.`
      : e.status ? `A Vercel recusou a consulta${detalhe}. Mande esta mensagem para quem mantém o Hangar.`
      : `Erro ao montar os números (${String((e && e.message) || e).slice(0, 160)}). Mande esta mensagem para quem mantém o Hangar.`;
    return json(502, { erro: msg });
  }
}

export default { fetch: responder };
