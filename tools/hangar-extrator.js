/**
 * hangar-extrator.js — roda NO NAVEGADOR de quem tem acesso ao Hangar Academy.
 *
 * O site (Google Sites) não responde a leitura por rede a partir da sessão de desenvolvimento e o
 * Drive não exporta arquivos do Sites. Então quem está logado extrai:
 *
 *   1. Abra https://sites.google.com/produtivajunior.com.br/hangaracademy/in%C3%ADcio
 *   2. F12 → Console → cole este arquivo inteiro → Enter.
 *   3. O script percorre todas as páginas do menu, converte cada uma em Markdown e baixa
 *      um único arquivo hangar-academy.txt (se o download for bloqueado, o texto vai para a área
 *      de transferência: cole num arquivo com esse nome).
 *   4. No repositório: node tools/hangar-importar.mjs ~/Downloads/hangar-academy.txt --por seu@produtivajunior.com.br
 *
 * Só lê páginas do próprio site (mesma origem) e não altera nada.
 */
(async () => {
  const BASE = '/produtivajunior.com.br/hangaracademy';
  const abs = (h) => { try { return new URL(h, location.href); } catch (e) { return null; } };
  const dentro = (u) => u && u.origin === location.origin && u.pathname.startsWith(BASE);
  const limpa = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  // 1. páginas: links do menu + da página atual (e, recursivamente, das páginas visitadas)
  const fila = [abs(location.href)]; const vistas = new Set(); const paginas = [];
  const coletar = (doc) => { for (const a of doc.querySelectorAll('a[href]')) { const u = abs(a.getAttribute('href')); if (dentro(u)) { u.hash = ''; u.search = ''; if (!vistas.has(u.pathname)) { vistas.add(u.pathname); fila.push(u); } } } };
  vistas.add(fila[0].pathname);

  // 2. conversão de um nó do conteúdo em Markdown
  const md = (node, nivel = 0) => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'svg', 'img', 'iframe', 'button'].includes(tag)) return tag === 'iframe' ? `\n[vídeo/embed: ${node.src}]\n` : '';
    const filhos = () => [...node.childNodes].map((c) => md(c, nivel)).join('');
    if (/^h[1-6]$/.test(tag)) { const n = Math.min(Number(tag[1]), 3); return `\n\n${'#'.repeat(n === 1 ? 1 : 2)} ${limpa(filhos())}\n\n`; }
    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') { const t = filhos(); return /\n\n$/.test(t) || !limpa(t) ? t : t + '\n\n'; }
    if (tag === 'br') return '\n';
    if (tag === 'li') return `${'  '.repeat(nivel)}- ${limpa(filhos())}\n`;
    if (tag === 'ul' || tag === 'ol') return '\n' + [...node.children].map((c) => md(c, nivel + 1)).join('') + '\n';
    if (tag === 'a') { const u = abs(node.getAttribute('href')); const t = limpa(filhos()); return u && !dentro(u) ? `[${t || u.href}](${u.href})` : t; }
    if (tag === 'strong' || tag === 'b') return `**${limpa(filhos())}**`;
    if (tag === 'tr') return '| ' + [...node.children].map((c) => limpa(md(c))).join(' | ') + ' |\n';
    if (tag === 'table') return '\n' + [...node.querySelectorAll('tr')].map((r) => md(r)).join('') + '\n';
    return filhos();
  };
  const converter = (doc, url) => {
    const main = doc.querySelector('[role="main"]') || doc.querySelector('main') || doc.body;
    const titulo = limpa((doc.querySelector('[role="main"] h1') || doc.querySelector('h1') || doc.querySelector('title') || {}).textContent) || decodeURIComponent(url.pathname.split('/').pop());
    const corpo = md(main).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { url: url.href, titulo, corpo };
  };

  // 3. percorre
  coletar(document);
  paginas.push(converter(document, fila.shift()));
  while (fila.length) {
    const u = fila.shift();
    try {
      const r = await fetch(u.href, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      coletar(doc); paginas.push(converter(doc, u));
      console.log('✓', u.pathname);
    } catch (e) { console.warn('✗', u.pathname, e); paginas.push({ url: u.href, titulo: u.pathname, corpo: `[não consegui ler: ${e}]` }); }
  }

  // 4. um arquivo só
  const hoje = new Date().toISOString().slice(0, 10);
  const texto = `# Hangar Academy — extraído em ${hoje} por ${location.hostname}\n\n` +
    paginas.map((p) => `===== PAGE: ${p.url}\ntitulo: ${p.titulo}\n---\n${p.corpo}\n`).join('\n');
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain' })); a.download = 'hangar-academy.txt'; document.body.appendChild(a); a.click(); a.remove();
    console.log(`Pronto: ${paginas.length} página(s) em hangar-academy.txt`);
  } catch (e) {
    try { await navigator.clipboard.writeText(texto); console.log(`Download bloqueado; ${paginas.length} página(s) copiadas para a área de transferência. Cole em hangar-academy.txt.`); } catch (e2) { console.log(texto); }
  }
})();
