class Component extends DCLogic {
  state = {
    screen: 'home',
    query: '',
    filters: { tipo: [], area: [], escopo: [], complexidade: [], status: [], freq: [], responsavel: [] },
    cardStyle: 'detalhado',
    selId: null,
    escopoId: null,
    caseId: null,
    caseQuery: '',
    caseFilters: { escopo: [], segmento: [], ano: [], ferramenta: [] },
    casesLocais: this.carregarLocal('hangar.casesLocais', []),
    formCase: this.formCaseVazio(),
    caseErro: '',
    caseFiltroFerr: '',
    filtrosAbertos: false,
    trilhaFeitos: this.carregarLocal('hangar.trilha', []),
    glossQuery: '',
    eu: this.carregarLocal('hangar.eu', {}),
    open: {},
    rating: null,
    feedback: '',
    anexosId: null,
    confirmRemoverId: null,
    recoKey: null,
    toast: '',
    form: this.formVazio(),
    extra: this.carregarLocal('hangar.extra', []),
    doc: null,
    aiDocInput: '',
    aiLoading: false,
    aiError: '',
    cadMode: 'ia',
    aiToolInput: '',
    aiToolNome: '',
    aiToolLoading: false,
    aiToolError: '',
    applyInput: '',
    applyLoading: false,
    applyError: '',
    applyResult: null,
    applyOpen: false,
    // cadastro — modelo padrão de ferramenta
    modelos: this.defaultModelos(),
    modeloNome: '',
    modeloFile: null,
    modeloLoading: false,
    modeloError: ''
  };

  // Modelos-padrão de ferramenta já registrados (formato lido de um anexo).
  // Cada modelo define o LAYOUT e os blocos/quadrantes que a IA preenche.
  // Conteúdo em src/data/modelos.json.
  defaultModelos() { return structuredClone(DADOS.modelos); }

  // Conteúdo em src/data/documento-padrao.json.
  // Clonado a cada chamada: o editor de documentação altera o objeto retornado.
  defaultDoc() { return structuredClone(DADOS.documentoPadrao); }

  DATA = DADOS.ferramentas;

  PROBLEMAS = DADOS.problemas;

  // Escopos (linhas de serviço) com etapas ordenadas — src/data/escopos.json.
  ESCOPOS = DADOS.escopos;

  // Banco de cases — src/data/cases.json (publicados) + os que este navegador cadastrou (localStorage).
  CASES = DADOS.cases;
  // Trilha do primeiro projeto e glossário — src/data/trilha.json.
  TRILHA = DADOS.trilha || { passos: [], glossario: [] };

  // Persistência local: sem backend, o que o membro cadastra fica neste navegador. Tudo em try/catch:
  // sem localStorage (modo privado, file:// bloqueado) o app segue funcionando, só não lembra.
  carregarLocal(chave, padrao) { try { const v = (typeof localStorage !== 'undefined') && localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
  salvarLocal(chave, valor) { try { if (typeof localStorage !== 'undefined') { localStorage.setItem(chave, JSON.stringify(valor)); return true; } } catch (e) {} return false; }
  allCases() { return this.state.casesLocais.map(c => ({ ...c, local: true })).concat(this.CASES); }

  // Link de vídeo → URL embutível. YouTube e Drive; qualquer outro fica só como link.
  embedDe(url) {
    const u = String(url || '').trim();
    let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(u);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/.exec(u);
    if (m) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
    return '';
  }
  // Foto do case → URL que um <img> consegue mostrar. Data URL (enviada do computador) passa direto;
  // link do Drive vira a miniatura pública do arquivo (precisa de acesso, como os documentos); outro https fica como está.
  fotoSrc(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^data:image\//.test(u)) return u;
    const m = /drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=|thumbnail\?(?:.*&)?id=)([A-Za-z0-9_-]+)/.exec(u);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1600';
    return u;
  }
  // Lê a foto escolhida, reduz para no máximo 1600px e devolve um JPEG em data URL (~100–400 KB).
  // O case vira um JSON único, então a foto vai dentro dele; por isso o limite de tamanho.
  lerFoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || '')) return reject(new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).'));
      const r = new FileReader();
      r.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Não consegui abrir essa imagem.'));
        img.onload = () => {
          try {
            const MAX = 1600, esc = Math.min(1, MAX / Math.max(img.width, img.height, 1));
            const w = Math.max(1, Math.round(img.width * esc)), h = Math.max(1, Math.round(img.height * esc));
            const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
            let q = 0.85, out = cv.toDataURL('image/jpeg', q);
            while (out.length > 700000 && q > 0.45) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
            resolve(out);
          } catch (e) { reject(new Error('Não consegui processar a imagem.')); }
        };
        img.src = String(r.result);
      };
      r.readAsDataURL(file);
    });
  }
  receberFoto(file) {
    this.lerFoto(file).then(
      (dados) => { this.setState(st => ({ formCase: { ...st.formCase, fotoDados: dados }, caseErro: '' })); this.showToast('Foto pronta. Ela vai junto no arquivo do case.'); },
      (err) => this.setState({ caseErro: err.message }));
  }
  onFotoArquivo(e) { const f = e && e.target && e.target.files && e.target.files[0]; if (f) this.receberFoto(f); try { e.target.value = ''; } catch (x) {} }
  onFotoDrop(e) { if (e && e.preventDefault) e.preventDefault(); const f = e && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) this.receberFoto(f); }
  onFotoDragOver(e) { if (e && e.preventDefault) e.preventDefault(); }
  abrirSeletorFoto() { if (typeof document === 'undefined') return; const el = document.getElementById('hangar-foto-input'); if (el) el.click(); }
  removerFoto() { this.setState(st => ({ formCase: { ...st.formCase, fotoDados: '', fotoLink: '', fotoLegenda: '' } })); }

  // Documento em PDF anexado direto (sem passar pelo Drive): vira data URL dentro do próprio case.
  // Sem compressão possível (não é imagem), por isso o limite de tamanho é mais apertado.
  DOC_PDF_MAX = 8 * 1024 * 1024;
  lerPdf(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^application\/pdf$/.test(file.type || '') && !/\.pdf$/i.test(file.name || '')) return reject(new Error('Escolha um arquivo PDF.'));
      if (file.size > this.DOC_PDF_MAX) return reject(new Error('PDF maior que 8 MB — use o link do Drive em vez de anexar.'));
      const r = new FileReader();
      r.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(file);
    });
  }
  receberDocPdf(idx, file) {
    this.lerPdf(file).then(
      (dados) => this.setState(st => ({ formCase: { ...st.formCase, documentos: st.formCase.documentos.map((x, j) => j === idx ? { ...x, url: dados, nome: x.nome.trim() || file.name } : x) }, caseErro: '' })),
      (err) => this.setState({ caseErro: err.message }));
  }
  onDocPdfArquivo(idx, e) { const f = e && e.target && e.target.files && e.target.files[0]; if (f) this.receberDocPdf(idx, f); try { e.target.value = ''; } catch (x) {} }
  abrirSeletorDocPdf(idx) { if (typeof document === 'undefined') return; const el = document.getElementById('hangar-doc-pdf-' + idx); if (el) el.click(); }
  removerDocPdf(idx) { this.setState(st => ({ formCase: { ...st.formCase, documentos: st.formCase.documentos.map((x, j) => j === idx ? { ...x, url: '' } : x) } })); }

  slugDe(t) { return this.normaliza(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  soDigitos(t) { return String(t || '').replace(/\D/g, ''); }
  abrirLink(url) { if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener'); }
  // Chrome bloqueia window.open direto para "data:" (anti-phishing); vira Blob primeiro, como o material da reunião já fazia.
  abrirDataUrl(url) {
    const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(url || '');
    if (!m) { this.abrirLink(url); return; }
    try {
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: m[1] }));
      this.abrirLink(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) { this.abrirLink(url); }
  }
  baixarArquivo(nome, conteudo, mime) {
    if (typeof document === 'undefined') return false;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([conteudo], { type: mime }));
      a.download = nome; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return true;
    } catch (e) { return false; }
  }

  // ---- Material para a reunião com o cliente: uma página HTML pronta para imprimir com as perguntas-chave,
  // o passo a passo, as entradas e, quando a ferramenta tem modelo em canvas, o canvas em branco.
  esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
  materialReuniao(it) {
    const e = (t) => this.esc(t);
    const lista = (arr) => (arr || []).filter(x => x && x !== '—');
    const modelo = this.state.modelos.find(m => m.toolId === it.id && m.layout === 'canvas' && (m.blocos || []).length);
    const linhas = '<div class="linhas"><span></span><span></span><span></span></div>';
    const perguntas = lista(it.perguntas).map((q, i) => '<li><b>' + (i + 1) + '.</b> ' + e(q) + linhas + '</li>').join('');
    const passos = lista(it.passos).map((q) => '<li><span class="cb"></span>' + e(q) + '</li>').join('');
    const entradas = lista(it.entradas).map((q) => '<li><span class="cb"></span>' + e(q) + '</li>').join('');
    const cuidados = lista(it.cuidados).map((q) => '<li>' + e(q) + '</li>').join('');
    const quando = lista(it.quandoUsar).map((q) => '<li>' + e(q) + '</li>').join('');
    const canvas = modelo ? '<section class="pagina"><h2>' + e(modelo.nome || it.nome) + ' — canvas em branco</h2><div class="canvas">' +
      modelo.blocos.map((b) => '<div class="bloco" style="grid-column:' + e(b.gc || 'auto') + ';grid-row:' + e(b.gr || 'auto') + '"><b>' + e(b.titulo) + '</b>' + (b.dica ? '<small>' + e(b.dica) + '</small>' : '') + '</div>').join('') +
      '</div></section>' : '';
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + e(it.nome) + ' — material para a reunião</title><style>' +
      '@page{size:A4;margin:16mm}body{font:12.5pt/1.45 -apple-system,"Segoe UI",Roboto,sans-serif;color:#172A30;margin:0;padding:24px;max-width:190mm}' +
      'h1{font-size:22pt;margin:0 0 4px}h2{font-size:13pt;margin:22px 0 8px;color:#1E7C92;text-transform:uppercase;letter-spacing:.04em}' +
      '.meta{display:flex;gap:18px;flex-wrap:wrap;margin:14px 0 6px;font-size:11pt;color:#5E747B}.meta span{border-bottom:1px solid #9DAEB4;min-width:150px;padding:0 4px 2px}' +
      'ul,ol{margin:0;padding-left:0;list-style:none}li{margin:0 0 8px;page-break-inside:avoid}.cb{display:inline-block;width:11px;height:11px;border:1.5px solid #3C545B;border-radius:3px;margin:0 8px -1px 0}' +
      '.linhas span{display:block;border-bottom:1px solid #C9DBE0;height:20px}.linhas{margin:4px 0 2px 18px}' +
      '.pagina{page-break-before:always}.canvas{display:grid;grid-template-columns:repeat(10,1fr);grid-auto-rows:minmax(58mm,auto);gap:3mm;margin-top:8px}' +
      '.bloco{border:1.5px solid #3C545B;border-radius:6px;padding:6px 8px;font-size:10pt}.bloco b{display:block}.bloco small{display:block;color:#7C9097;font-size:8pt;line-height:1.3;margin-top:2px}' +
      '.print{position:fixed;top:12px;right:12px;border:none;background:#3DAFC7;color:#fff;font:600 11pt sans-serif;padding:9px 14px;border-radius:9px;cursor:pointer}@media print{.print{display:none}body{padding:0}}' +
      '</style></head><body><button class="print" onclick="window.print()">Imprimir</button>' +
      '<div style="font-size:9.5pt;color:#8AA0A7;letter-spacing:.06em;text-transform:uppercase">Hangar · Produtiva Júnior · material para a reunião</div>' +
      '<h1>' + e(it.nome) + '</h1><div style="color:#5E747B">' + e(it.descricao || '') + '</div>' +
      '<div class="meta"><span>Cliente: </span><span>Data: </span><span>Consultor(a): </span></div>' +
      (it.objetivo ? '<h2>Objetivo</h2><p>' + e(it.objetivo) + '</p>' : '') +
      (quando ? '<h2>Quando usar</h2><ul>' + quando + '</ul>' : '') +
      (entradas ? '<h2>O que levar / pedir ao cliente</h2><ul>' + entradas + '</ul>' : '') +
      (perguntas ? '<h2>Perguntas-chave</h2><ol>' + perguntas + '</ol>' : '') +
      (passos ? '<h2>Passo a passo</h2><ul>' + passos + '</ul>' : '') +
      (cuidados ? '<h2>Cuidados</h2><ul>' + cuidados.replace(/<li>/g, '<li>• ') + '</ul>' : '') +
      canvas + '</body></html>';
  }
  abrirMaterial(it) {
    const html = this.materialReuniao(it);
    if (typeof window !== 'undefined') window.__hangarUltimoMaterial = { nome: this.slugDe(it.nome) + '-reuniao.html', html };
    try { this.abrirLink(URL.createObjectURL(new Blob([html], { type: 'text/html' }))); this.showToast('Material aberto em outra aba. Use Ctrl+P para imprimir.'); }
    catch (e) { this.showToast('Não consegui abrir aqui. Use "Baixar (.html)".'); }
  }
  baixarMaterial(it) {
    const html = this.materialReuniao(it); const nome = this.slugDe(it.nome) + '-reuniao.html';
    if (typeof window !== 'undefined') window.__hangarUltimoMaterial = { nome, html };
    this.showToast(this.baixarArquivo(nome, html, 'text/html') ? 'Arquivo ' + nome + ' gerado. Abra e imprima.' : 'Não consegui gerar o arquivo aqui.');
  }
  linhas(t) { return String(t || '').split('\n').map(x => x.trim()).filter(Boolean); }
  fmtMes(s) { const m = /^(\d{4})-(\d{2})$/.exec(s || ''); if (!m) return s || ''; const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']; return meses[+m[2]-1] + ' ' + m[1]; }

  formCaseVazio() {
    const eu = this.carregarLocal('hangar.eu', {});
    return { cliente:'', segmento:'', porte:'', cidade:'', escopoId:'', escopoNome:'', inicio:'', fim:'', duracaoDias:'',
      gerenteNome:'', gerenteEmail:'', gerenteZap:'', c1Nome:'', c1Email:'', c1Zap:'', c2Nome:'', c2Email:'', c2Zap:'',
      resumo:'', desafio:'', solucao:'', resultados:'', aprendizados:'', depoimento:'', tags:'',
      ferramentas:[], documentos:[{ nome:'', tipo:(DADOS.taxonomia.documentosCase||[])[3] || 'Outro', url:'' }],
      fotoDados:'', fotoLink:'', fotoLegenda:'',
      videoUrl:'', videoQuem:'Gerente e consultores', videoDuracao:'',
      meuNome: eu.nome || '', meuEmail: eu.email || '' };
  }
  validarCase(f) {
    if (!f.cliente.trim()) return 'Informe o nome do cliente.';
    if (!f.segmento.trim()) return 'Informe o segmento do cliente.';
    if (!f.escopoId && !f.escopoNome.trim()) return 'Escolha o escopo do projeto (ou descreva em "Outro").';
    if (!f.gerenteNome.trim() || !f.c1Nome.trim() || !f.c2Nome.trim()) return 'A equipe precisa de 1 gerente e 2 consultores com nome.';
    if (f.resumo.trim().length < 20) return 'Escreva um resumo do projeto com pelo menos duas frases.';
    const emails = [f.gerenteEmail, f.c1Email, f.c2Email, f.meuEmail].filter(Boolean);
    if (emails.some(e => !/^[^@\s]+@produtivajunior\.com\.br$/.test(e.trim()))) return 'Use e-mails @produtivajunior.com.br na equipe.';
    for (const z of [f.gerenteZap, f.c1Zap, f.c2Zap]) { const d = this.soDigitos(z); if (z && (d.length < 10 || d.length > 13)) return 'WhatsApp com DDD, só números (ex.: 84 99999-0000).'; }
    for (const d of f.documentos) { if ((d.nome || d.url) && !/^https:\/\//.test(d.url || '') && !/^data:application\/pdf/.test(d.url || '')) return 'Cada documento precisa de um link https (Drive) ou de um PDF anexado.'; }
    if (f.videoUrl && !/^https:\/\//.test(f.videoUrl.trim())) return 'O link do vídeo precisa começar com https://.';
    if (!f.fotoDados && f.fotoLink && !/^https:\/\//.test(f.fotoLink.trim())) return 'O link da foto precisa começar com https:// (Drive).';
    if (!f.meuNome.trim()) return 'Diga quem está cadastrando (seu nome).';
    return '';
  }
  montarCase(f) {
    const ano = (f.fim || f.inicio || this.hoje()).slice(0, 4);
    const escopo = this.ESCOPOS.find(e => e.id === f.escopoId);
    const pessoa = (n, e, z) => ({ nome: n.trim(), email: (e || '').trim(), whatsapp: this.soDigitos(z) });
    return {
      id: [this.slugDe(f.cliente), ano, this.slugDe(escopo ? escopo.nome : f.escopoNome)].filter(Boolean).join('-'),
      cliente: f.cliente.trim(), segmento: f.segmento.trim(), porte: f.porte || '', cidade: f.cidade.trim(),
      escopoId: escopo ? escopo.id : null, escopoNome: escopo ? escopo.nome : f.escopoNome.trim(),
      periodo: { inicio: f.inicio || '', fim: f.fim || '' }, duracaoDias: f.duracaoDias ? Number(f.duracaoDias) : null,
      equipe: { gerente: pessoa(f.gerenteNome, f.gerenteEmail, f.gerenteZap), consultores: [pessoa(f.c1Nome, f.c1Email, f.c1Zap), pessoa(f.c2Nome, f.c2Email, f.c2Zap)] },
      resumo: f.resumo.trim(), desafio: f.desafio.trim(), solucao: f.solucao.trim(),
      resultados: this.linhas(f.resultados), aprendizados: this.linhas(f.aprendizados),
      ferramentas: f.ferramentas.slice(),
      documentos: f.documentos.filter(d => d.url).map(d => ({ nome: d.nome.trim() || (/^data:/.test(d.url) ? 'Documento.pdf' : d.url), tipo: d.tipo, url: d.url.trim() })),
      foto: (f.fotoDados || f.fotoLink.trim()) ? { url: f.fotoDados || f.fotoLink.trim(), legenda: (f.fotoLegenda || '').trim() } : null,
      video: f.videoUrl.trim() ? { url: f.videoUrl.trim(), quem: f.videoQuem.trim(), duracao: f.videoDuracao.trim() } : null,
      depoimentoCliente: f.depoimento.trim(), tags: f.tags.split(',').map(x => x.trim()).filter(Boolean),
      cadastradoPor: pessoa(f.meuNome, f.meuEmail), atualizado: this.hoje(),
    };
  }
  publishCase() {
    const f = this.state.formCase;
    const erro = this.validarCase(f);
    if (erro) { this.setState({ caseErro: erro }); return; }
    const c = this.montarCase(f);
    const casesLocais = [c].concat(this.state.casesLocais.filter(x => x.id !== c.id));
    const guardou = this.salvarLocal('hangar.casesLocais', casesLocais);
    const eu = { nome: f.meuNome.trim(), email: f.meuEmail.trim() };
    this.salvarLocal('hangar.eu', eu);
    this.setState({ casesLocais, eu, caseErro: '', formCase: this.formCaseVazio() });
    // Sem espaço no navegador (fotos grandes) o case fica só nesta sessão: avisa para baixar já.
    this.showToast(guardou ? 'Case salvo neste navegador. Baixe o arquivo e envie ao CIEP para publicar para todos.' : 'O navegador não guardou o case (sem espaço). Baixe o arquivo agora para não perder.');
    this.openCase(c.id);
  }
  // Gera o arquivo do case para enviar ao CIEP. Guarda o último em window para o smoke conferir.
  baixarJson(c) {
    const { local, ...limpo } = c;
    const json = JSON.stringify(limpo, null, 2);
    const nome = 'case-' + limpo.id + '.json';
    if (typeof window !== 'undefined') window.__hangarUltimoDownload = { nome, json };
    if (typeof document === 'undefined') return;
    this.showToast(this.baixarArquivo(nome, json, 'application/json') ? 'Arquivo ' + nome + ' gerado. Envie ao CIEP.' : 'Não consegui gerar o arquivo aqui. Use "Copiar JSON".');
  }
  copiarJson(c) {
    const { local, ...limpo } = c;
    const json = JSON.stringify(limpo, null, 2);
    const ok = () => this.showToast('JSON do case copiado. Cole numa mensagem para o CIEP.');
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(json).then(ok, () => this.showToast('Não consegui copiar automaticamente.'));
      else ok();
    } catch (e) { this.showToast('Não consegui copiar automaticamente.'); }
  }
  openCase(id) { this.setState({ screen:'case', caseId:id }); if(typeof window!=='undefined') window.scrollTo(0,0); }
  openNovoCase() { this.setState({ screen:'novo-case', caseErro:'' }); if(typeof window!=='undefined') window.scrollTo(0,0); }
  pedirRemoverCase(id, e) { if(e&&e.stopPropagation)e.stopPropagation(); this.setState({ confirmRemoverId:id }); }
  cancelarRemoverCase() { this.setState({ confirmRemoverId:null }); }
  // Só remove do navegador de quem cadastrou: sem backend, não existe "publicado para todos" a desfazer daqui.
  removerCase(id) {
    const casesLocais = this.state.casesLocais.filter(c => c.id !== id);
    this.salvarLocal('hangar.casesLocais', casesLocais);
    this.setState({ casesLocais, confirmRemoverId:null, screen:'cases', caseId:null });
    if (typeof window !== 'undefined') window.scrollTo(0,0);
    this.showToast('Case removido deste navegador.');
  }

  decorateCase(c) {
    const escopo = c.escopoId ? this.ESCOPOS.find(e => e.id === c.escopoId) : null;
    const escopoNome = escopo ? escopo.nome : (c.escopoNome || 'Escopo não informado');
    const g = escopo ? (this.TAXONOMIA.gruposEscopo[escopo.grupo] || {}) : {};
    const eq = c.equipe || {}; const cons = eq.consultores || [];
    const escopoRotulo = escopo ? escopo.nome : (c.escopoNome || 'o projeto');
    const msg = (x) => 'Oi ' + (x.nome || '').split(' ')[0] + ', vi o case ' + (c.cliente || '') + ' no Hangar e queria tirar uma dúvida sobre ' + escopoRotulo + '.';
    const equipe = [{ ...(eq.gerente||{}), papel:'Gerente' }].concat(cons.map(x => ({ ...x, papel:'Consultor' })))
      .filter(x => x.nome).map(x => {
        const zap = this.soDigitos(x.whatsapp); const zapIntl = zap ? ((zap.length <= 11) ? '55' + zap : zap) : '';
        return { ...x, iniciais: this.initials(x.nome), hasEmail: !!x.email, hasZap: !!zap, hasContato: !!(x.email || zap),
          emailUrl: x.email ? 'mailto:' + x.email + '?subject=' + encodeURIComponent('Dúvida sobre o case ' + (c.cliente || '') + ' (Hangar)') + '&body=' + encodeURIComponent(msg(x)) : '',
          zapUrl: zap ? 'https://wa.me/' + zapIntl + '?text=' + encodeURIComponent(msg(x)) : '',
          abrirEmail: () => this.abrirLink(x.email ? 'mailto:' + x.email + '?subject=' + encodeURIComponent('Dúvida sobre o case ' + (c.cliente || '') + ' (Hangar)') + '&body=' + encodeURIComponent(msg(x)) : ''),
          abrirZap: () => this.abrirLink(zap ? 'https://wa.me/' + zapIntl + '?text=' + encodeURIComponent(msg(x)) : '') };
      });
    const hasContatos = equipe.some(x => x.hasContato);
    const ferramentas = (c.ferramentas || []).map(fid => this.allData().find(d => d.id === fid)).filter(Boolean).map(d => this.decorate(d));
    const docs = (c.documentos || []).map(d => ({ ...d, ext: this.extOf(d), btnLabel: /^data:/.test(d.url || '') ? 'Abrir PDF' : 'Abrir no Drive', abrir: (e) => { if(e&&e.stopPropagation)e.stopPropagation(); this.abrirDataUrl(d.url); } }));
    const video = c.video && c.video.url ? c.video : null;
    const embed = video ? this.embedDe(video.url) : '';
    const foto = c.foto && c.foto.url ? c.foto : null;
    const fotoSrc = foto ? this.fotoSrc(foto.url) : '';
    // Sem foto, a galeria mostra um cartão na cor do grupo do escopo com as iniciais do cliente.
    const inicial = this.initials(c.cliente || '?');
    const placeholderBg = 'linear-gradient(150deg,' + (g.bg || '#ECEFF7') + ' 0%,' + (g.cor || '#4E5E96') + ' 160%)';
    const periodoFmt = [this.fmtMes((c.periodo||{}).inicio), this.fmtMes((c.periodo||{}).fim)].filter(Boolean).join(' – ');
    const ano = ((c.periodo||{}).fim || (c.periodo||{}).inicio || c.atualizado || '').slice(0, 4);
    return { ...c, escopoNome, escopoCor: g.cor || '#4E5E96', escopoBg: g.bg || '#ECEFF7', hasEscopo: !!escopo,
      abrirEscopo: () => { if (escopo) this.openEscopo(escopo.id); },
      equipe, equipeResumo: equipe.map(x => x.nome.split(' ')[0]).join(', '), hasContatos,
      ferramentas, hasFerramentas: ferramentas.length > 0, docs, nDocs: docs.length, hasDocs: docs.length > 0,
      video, hasVideo: !!video, videoEmbed: embed, hasVideoEmbed: !!embed, videoLink: video ? video.url : '',
      foto, hasFoto: !!fotoSrc, semFoto: !fotoSrc, fotoSrc, fotoLegenda: foto ? (foto.legenda || '') : '', hasFotoLegenda: !!(foto && foto.legenda), inicial, placeholderBg,
      abrirVideo: () => { if (video && typeof window!=='undefined') window.open(video.url, '_blank', 'noopener'); },
      periodoFmt: periodoFmt || (ano ? String(ano) : ''), ano, duracaoFmt: c.duracaoDias ? c.duracaoDias + ' dias' : '',
      resultados: c.resultados || [], hasResultados: !!(c.resultados && c.resultados.length), resultadoDestaque: (c.resultados && c.resultados[0]) || c.resumo,
      aprendizados: c.aprendizados || [], hasAprendizados: !!(c.aprendizados && c.aprendizados.length),
      hasDesafio: !!c.desafio, hasSolucao: !!c.solucao, hasDepoimento: !!c.depoimentoCliente,
      tags: c.tags || [], hasTags: !!(c.tags && c.tags.length), local: !!c.local,
      cadastradoTexto: 'Cadastrado por ' + ((c.cadastradoPor||{}).nome || '—') + ' · ' + this.fmtData(c.atualizado),
      open: () => this.openCase(c.id), baixar: (e) => { if(e&&e.stopPropagation)e.stopPropagation(); this.baixarJson(c); }, copiar: () => this.copiarJson(c),
      remover: (e) => this.pedirRemoverCase(c.id, e) };
  }
  computeCases() {
    const f = this.state.caseFilters; const q = this.normaliza(this.state.caseQuery.trim());
    return this.allCases().filter(c => {
      const escopoKey = c.escopoId || ('outro:' + (c.escopoNome || ''));
      const ano = ((c.periodo||{}).fim || (c.periodo||{}).inicio || c.atualizado || '').slice(0, 4);
      if (f.escopo.length && !f.escopo.includes(escopoKey)) return false;
      if (f.segmento.length && !f.segmento.includes(c.segmento)) return false;
      if (f.ano.length && !f.ano.includes(ano)) return false;
      if (f.ferramenta.length && !(c.ferramentas||[]).some(x => f.ferramenta.includes(x))) return false;
      if (q) {
        const escopo = c.escopoId ? this.ESCOPOS.find(e => e.id === c.escopoId) : null;
        const eq = c.equipe || {};
        const hay = this.normaliza([c.cliente, c.segmento, c.porte, c.cidade, escopo ? escopo.nome : c.escopoNome, c.resumo, c.desafio, c.solucao, c.depoimentoCliente,
          ...(c.resultados||[]), ...(c.aprendizados||[]), ...(c.tags||[]), (eq.gerente||{}).nome, ...((eq.consultores||[]).map(x=>x.nome)),
          ...((c.ferramentas||[]).map(fid => (this.allData().find(d=>d.id===fid)||{}).nome)), ...((c.documentos||[]).map(d=>d.nome))].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  buildCaseFilters() {
    const todos = this.allCases(); const f = this.state.caseFilters;
    const conta = (lista, chave) => { const m = new Map(); for (const c of lista) for (const v of chave(c)) if (v) m.set(v, (m.get(v)||0)+1); return m; };
    const grupos = [
      { key:'escopo', label:'Escopo', conta: conta(todos, c => [c.escopoId || ('outro:' + (c.escopoNome||''))]), rotulo: v => v.startsWith('outro:') ? v.slice(6) : ((this.ESCOPOS.find(e=>e.id===v)||{}).nome || v) },
      { key:'segmento', label:'Segmento', conta: conta(todos, c => [c.segmento]), rotulo: v => v },
      { key:'ano', label:'Ano', conta: conta(todos, c => [((c.periodo||{}).fim || (c.periodo||{}).inicio || c.atualizado || '').slice(0,4)]), rotulo: v => v },
      { key:'ferramenta', label:'Ferramenta usada', conta: conta(todos, c => c.ferramentas||[]), rotulo: v => (this.allData().find(d=>d.id===v)||{}).nome || v },
    ];
    return grupos.map(g => ({ key:g.key, label:g.label, options: [...g.conta.entries()].sort((a,b)=>b[1]-a[1]).map(([v,n]) => {
      const active = f[g.key].includes(v);
      return { value:v, label:g.rotulo(v), count:n, active, inactive:!active, toggle: () => this.setState(s => { const arr = s.caseFilters[g.key]; return { caseFilters: { ...s.caseFilters, [g.key]: arr.includes(v) ? arr.filter(x=>x!==v) : arr.concat(v) } }; }) };
    }) })).filter(g => g.options.length);
  }

  // Enums e estilos vêm de src/data/taxonomia.json. Nenhuma lista literal aqui:
  // filtro, formulário, chips, cores e o schema do prompt derivam de TAXONOMIA.
  TAXONOMIA = DADOS.taxonomia;
  TIPO_STYLE = DADOS.taxonomia.tipos;
  COMPLEX_STYLE = DADOS.taxonomia.complexidade;
  STATUS_COLOR = DADOS.taxonomia.status;
  ANEXO_STYLE = DADOS.taxonomia.anexos;

  // Valores "vivos" de um enum da taxonomia (sem os marcados como legado do MVP).
  vivos(obj) { return Array.isArray(obj) ? obj.slice() : Object.keys(obj).filter(k => !(obj[k] && obj[k].legado)); }
  // Lê DADOS direto: é chamado no inicializador de `state`, antes dos outros campos existirem.
  formVazio() { return { nome:'', tipo:'Ferramenta', categoria:this.vivos(DADOS.taxonomia.categorias)[0], descricao:'', objetivo:'', problema:'', complexidade:'Médio', tempo:'', responsavel:'' }; }
  hoje() { return new Date().toISOString().slice(0,10); }
  fmtData(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');
    if (!m) return s||'';
    const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return (+m[3])+' '+meses[+m[2]-1]+' '+m[1];
  }
  // `responsavel` é {nome,email} no acervo real e string nos itens herdados/criados em sessão.
  respNome(r) { return typeof r === 'string' ? r : ((r && r.nome) || ''); }
  respEmail(r) { return (r && typeof r === 'object' && r.email) || ''; }
  normaliza(t) { return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

  // Índice ferramenta → [{escopo, etapa}], derivado de escopos.json. A relação é N:N e
  // nunca é gravada dentro da ferramenta — a fonte é sempre a etapa do escopo.
  usoDe(id) {
    if (!this._uso) {
      this._uso = {};
      for (const e of this.ESCOPOS) for (const et of (e.etapas||[])) for (const fid of (et.ferramentas||[])) {
        (this._uso[fid] = this._uso[fid] || []).push({ escopoId:e.id, escopoNome:e.nome, grupo:e.grupo, etapaId:et.id, etapaNome:et.nome, ordem:et.ordem, open:()=>this.openEscopo(e.id) });
      }
    }
    return this._uso[id] || [];
  }

  allData() { return this.state.extra.concat(this.DATA); }
  initials(name) { return (name||'').split(' ').filter(w=>w.length>2).slice(0,2).map(w=>w[0]).join('').toUpperCase() || 'C'; }
  extOf(a) { const m=(a.nome||'').match(/\.([a-z0-9]+)$/i); return m?m[1].toUpperCase():(this.ANEXO_STYLE[a.tipo]?this.ANEXO_STYLE[a.tipo].ext:'DOC'); }

  decorate(it) {
    const ts = this.TIPO_STYLE[it.tipo] || this.TIPO_STYLE['Ferramenta'];
    const cs = this.COMPLEX_STYLE[it.complexidade] || this.COMPLEX_STYLE['Médio'];
    const uso = this.usoDe(it.id);
    return {
      ...it,
      tipoBg: ts.bg, tipoColor: ts.color, visualBg: ts.visual,
      complexBg: cs.bg, complexColor: cs.color,
      statusColor: this.STATUS_COLOR[it.status] || '#9DAEB4',
      categoriaCor: (this.TAXONOMIA.categorias[it.categoria]||{}).cor || '#1E7C92',
      initial: (it.nome||'?')[0].toUpperCase(),
      quandoResumo: (it.quandoUsar && it.quandoUsar[0]) || '',
      hasQuando: !!(it.quandoUsar && it.quandoUsar[0] && it.quandoUsar[0] !== '—'),
      anexosCount: (it.anexos||[]).length, hasAnexos: (it.anexos||[]).length > 0,
      respNome: this.respNome(it.responsavel), respEmail: this.respEmail(it.responsavel),
      atualizadoFmt: this.fmtData(it.atualizado),
      usoEmEscopos: uso, usoCount: uso.length, hasUso: uso.length>0, semUso: uso.length===0,
      usoResumo: uso.length ? (uso.length===1 ? uso[0].escopoNome : uso.length+' escopos') : 'Sem escopo vinculado',
      open: () => this.openContent(it.id),
      openAnexos: (e) => { if(e&&e.stopPropagation)e.stopPropagation(); this.setState({ anexosId: it.id }); },
    };
  }

  openContent(id) {
    this.setState({ screen:'conteudo', selId:id, open:{quando:true,problema:true,passos:true,io:false,perguntas:false,cuidados:false,exemplos:false}, rating:null, feedback:'', applyInput:'', applyResult:null, applyError:'', applyLoading:false, applyOpen:false });
    if (typeof window!=='undefined') window.scrollTo(0,0);
  }

  async generateApply() {
    const sel = this.allData().find(d=>d.id===this.state.selId); if (!sel) return;
    const inp = (this.state.applyInput||'').trim();
    if (inp.length < 8) { this.setState({ applyError:'Cole os insumos do projeto para preencher a ferramenta.' }); return; }
    this.setState({ applyLoading:true, applyError:'' });
    // Existe um modelo-padrão registrado para esta ferramenta? Então a IA segue exatamente esse formato.
    const modelo = this.state.modelos.find(m => m.toolId === sel.id);
    let schema, prompt;
    if (modelo) {
      const titulos = modelo.blocos.map(b=>'"'+b.titulo+'"').join(', ');
      const guia = modelo.blocos.map(b=>'- '+b.titulo+(b.dica?(': '+b.dica):'')).join('\n');
      schema = '{"titulo":string,"blocos":[{"titulo":string,"itens":[strings curtas e concretas]}]}';
      prompt = 'Você é um consultor sênior da Produtiva Júnior. Preencha a ferramenta "'+sel.nome+'" para o caso abaixo SEGUINDO EXATAMENTE o modelo-padrão registrado "'+modelo.nome+'" (lido do anexo '+modelo.fonte+'). Devolva EXATAMENTE estes blocos, nesta ordem, com estes títulos: '+titulos+'. Para cada bloco preencha de 3 a 5 itens curtos, concretos e específicos para ESTE caso (não explicações genéricas). Referência de cada bloco:\n'+guia+'\n\nResponda SOMENTE com JSON válido e COMPLETO neste formato: '+schema+'. Frases bem curtas para caber inteiro.\n\nInsumos do projeto:\n'+inp;
    } else {
      schema = '{"titulo":string,"blocos":[{"titulo":string,"itens":[strings curtas e concretas]}]}';
      prompt = 'Você é um consultor sênior da Produtiva Júnior. Aplique a ferramenta "'+sel.nome+'" ('+sel.descricao+') ao caso/projeto descrito abaixo e devolva a ferramenta JÁ PREENCHIDA, específica e concreta para ESTE caso (não explicações genéricas da ferramenta). Objetivo da ferramenta: '+sel.objetivo+'. Cada bloco é uma parte, quadrante ou seção da ferramenta, preenchido com itens concretos extraídos dos insumos. Responda SOMENTE com JSON válido e COMPLETO neste formato: '+schema+'. Use frases curtas para caber inteiro.\n\nInsumos do projeto:\n'+inp;
    }
    try {
      const out = await window.claude.complete({ messages:[{ role:'user', content: prompt }] });
      const j = this.parseAIJson(out);
      let blocos = (j.blocos||[]).map(b=>({ titulo:b.titulo||'', itens:Array.isArray(b.itens)?b.itens:[] }));
      let layout = 'list';
      if (modelo) {
        // alinha a saída com os blocos/posições do modelo-padrão (mantém o layout do anexo)
        layout = modelo.layout;
        blocos = modelo.blocos.map((mb,i) => {
          const match = blocos.find(b => (b.titulo||'').toLowerCase().includes(mb.titulo.toLowerCase().split(' ')[0])) || blocos[i] || {};
          return { titulo: mb.titulo, itens: Array.isArray(match.itens)?match.itens:[], gc: mb.gc, gr: mb.gr };
        });
      }
      this.setState({ applyLoading:false, applyResult:{ titulo:(modelo?modelo.nome:(j.titulo||sel.nome)), blocos, layout, modeloNome: modelo?modelo.nome:'', modeloFonte: modelo?modelo.fonte:'' }, applyOpen:true });
    } catch(e) {
      this.setState({ applyLoading:false, applyError:'Não consegui preencher agora. Tente refinar os insumos e gerar de novo.' });
    }
  }
  // Ritual trimestral: quem revisa o quê e até quando. Fonte: revisao.proximaRevisao (promover.mjs preenche).
  revisoesVals() {
    const hoje = this.hoje(); const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const itens = [...this.DATA.filter(f => f.revisao && f.revisao.proximaRevisao).map(f => ({ it: f, tipo: f.tipo, open: () => this.openContent(f.id) })),
      ...this.ESCOPOS.filter(e => e.revisao && e.revisao.proximaRevisao).map(e => ({ it: e, tipo: 'Escopo', open: () => this.openEscopo(e.id) }))]
      .map(({ it, tipo, open }) => { const px = it.revisao.proximaRevisao; const vencido = px < hoje; return { id: it.id, nome: it.nome, tipo, open, px, dataFmt: this.fmtData(px), vencido, proximo: !vencido && px <= em30,
        respNome: this.respNome(it.responsavel), respEmail: this.respEmail(it.responsavel), cor: vencido ? '#B23B47' : (px <= em30 ? '#9A6B17' : '#2E7D52'), bg: vencido ? '#FCF3F4' : (px <= em30 ? '#FBF1E0' : '#E7F4EC'), rotulo: vencido ? 'vencida' : (px <= em30 ? 'vence em breve' : 'em dia') }; })
      .sort((a, b) => a.px.localeCompare(b.px));
    const vencidos = itens.filter(x => x.vencido).length, proximos = itens.filter(x => x.proximo).length;
    return { revisoes: itens.slice(0, 8), hasRevisoes: itens.length > 0, revisoesTotal: itens.length, revisoesVencidas: vencidos, revisoesProximas: proximos,
      revisoesResumo: itens.length ? (vencidos ? vencidos + ' com revisão vencida' : 'nada vencido') + ' · ' + proximos + ' vence' + (proximos === 1 ? '' : 'm') + ' nos próximos 30 dias · ' + itens.length + ' conteúdos com dono e data' : '' };
  }
  trilhaVals(s, data, dec) {
    const feitos = new Set(s.trilhaFeitos || []);
    const passos = (this.TRILHA.passos || []).map((p, i) => {
      const feito = feitos.has(p.id);
      return { ...p, n: i + 1, feito, pendente: !feito, hasAcao: !!p.acao, acaoLabel: p.acao ? p.acao.label : '',
        ir: () => { if (!p.acao) return; if (p.acao.tela === 'novo-case') this.openNovoCase(); else this.nav(p.acao.tela); },
        toggle: () => this.setState(st => { const set = new Set(st.trilhaFeitos || []); set.has(p.id) ? set.delete(p.id) : set.add(p.id); const lista = [...set]; this.salvarLocal('hangar.trilha', lista); return { trilhaFeitos: lista }; }) };
    });
    // ferramentas essenciais: as mapeadas em mais etapas dos escopos; sem escopos, as de uso frequente
    const porUso = data.map(d => ({ d, n: this.usoDe(d.id).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5).map(x => x.d);
    const essenciais = (porUso.length ? porUso : data.filter(d => d.freq === 'Alta').slice(0, 5)).map(dec);
    // quem procurar: responsáveis que aparecem no acervo
    const resp = {};
    for (const d of data) { const nome = this.respNome(d.responsavel); const email = this.respEmail(d.responsavel); if (!nome || nome === '—') continue; (resp[nome] = resp[nome] || { nome, email, iniciais: this.initials(nome), n: 0 }).n++; }
    const responsaveis = Object.values(resp).sort((a, b) => b.n - a.n).slice(0, 8).map(r => ({ ...r, resumo: r.n + (r.n === 1 ? ' conteúdo' : ' conteúdos'), hasEmail: !!r.email }));
    const q = this.normaliza(s.glossQuery || '');
    const glossario = (this.TRILHA.glossario || []).filter(g => !q || this.normaliza(g.sigla + ' ' + (g.nome || '') + ' ' + g.definicao).includes(q))
      .map(g => ({ ...g, hasNome: !!g.nome, nome: g.nome || '' }));
    return { trilhaPassos: passos, trilhaFeitos: passos.filter(p => p.feito).length, trilhaTotal: passos.length, trilhaPct: passos.length ? Math.round(100 * passos.filter(p => p.feito).length / passos.length) : 0,
      trilhaCompleta: passos.length > 0 && passos.every(p => p.feito), essenciais, hasEssenciais: essenciais.length > 0, responsaveis, hasResponsaveis: responsaveis.length > 0,
      glossario, semGlossario: glossario.length === 0, glossQuery: s.glossQuery, onGlossQuery: (e) => this.setState({ glossQuery: e.target.value }) };
  }
  nav(screen) { this.setState({ screen, escopoId: screen==='escopos' ? null : this.state.escopoId, caseId: screen==='cases' ? null : this.state.caseId }); if(typeof window!=='undefined') window.scrollTo(0,0); }

  // ---- Rotas na URL (#/biblioteca, #/ferramenta/pmmc, #/escopo/<id>, #/case/<id>…)
  // Dá botão "voltar" do navegador, link compartilhável e F5 que volta para a mesma tela. Funciona em file://.
  hashDe(s) {
    switch (s.screen) {
      case 'biblioteca': return '#/biblioteca';
      case 'conteudo': return s.selId ? '#/ferramenta/' + s.selId : '#/biblioteca';
      case 'escopos': return s.escopoId ? '#/escopo/' + s.escopoId : '#/escopos';
      case 'cases': return '#/cases';
      case 'case': return s.caseId ? '#/case/' + s.caseId : '#/cases';
      case 'novo-case': return '#/cases/novo';
      case 'cadastro': return '#/cadastrar';
      case 'docs': return '#/docs';
      case 'recomendar': return '#/recomendar';
      case 'comece': return '#/comece';
      default: return '#/';
    }
  }
  aplicarHash() {
    if (typeof location === 'undefined') return;
    const h = decodeURIComponent(location.hash || '').replace(/^#\/?/, '');
    const [tela, id] = h.split('/');
    const idOk = (lista, x) => x && lista.some(i => i.id === x);
    if (tela === 'biblioteca') this.nav('biblioteca');
    else if (tela === 'ferramenta' && idOk(this.allData(), id)) this.openContent(id);
    else if (tela === 'escopos') this.nav('escopos');
    else if (tela === 'escopo' && idOk(this.ESCOPOS, id)) this.openEscopo(id);
    else if (tela === 'cases' && id === 'novo') this.openNovoCase();
    else if (tela === 'cases') this.nav('cases');
    else if (tela === 'case' && idOk(this.allCases(), id)) this.openCase(id);
    else if (tela === 'cadastrar') this.nav('cadastro');
    else if (tela === 'docs') this.goDocs();
    else if (tela === 'recomendar') this.nav('recomendar');
    else if (tela === 'comece') this.nav('comece');
    else if (this.state.screen !== 'home') this.nav('home');
  }
  componentDidMount() {
    if (typeof window === 'undefined') return;
    this._onHash = () => { if (this._hashPropria) { this._hashPropria = false; return; } this.aplicarHash(); };
    window.addEventListener('hashchange', this._onHash);
    // "/" foca a busca da tela; Esc fecha a janela de anexos
    this._onKey = (e) => {
      const alvo = e.target || {}; const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName || '') || alvo.isContentEditable;
      if (e.key === 'Escape' && this.state.anexosId) this.setState({ anexosId: null });
      if (e.key === 'Escape' && this.state.confirmRemoverId) this.setState({ confirmRemoverId: null });
      if (e.key === '/' && !digitando) { const el = document.querySelector('main input[placeholder]'); if (el) { e.preventDefault(); el.focus(); } }
    };
    window.addEventListener('keydown', this._onKey);
    if (location.hash && location.hash !== '#/') this.aplicarHash();
  }
  componentDidUpdate() {
    if (typeof location === 'undefined') return;
    const h = this.hashDe(this.state);
    if (location.hash !== h && !(h === '#/' && !location.hash)) { this._hashPropria = true; location.hash = h; }
  }
  componentWillUnmount() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('hashchange', this._onHash); window.removeEventListener('keydown', this._onKey);
  }
  openEscopo(id) { this.setState({ screen:'escopos', escopoId:id }); if(typeof window!=='undefined') window.scrollTo(0,0); }

  toggleFilter(group, value) {
    this.setState(s => {
      const arr = s.filters[group];
      const next = arr.includes(value) ? arr.filter(v=>v!==value) : arr.concat(value);
      return { filters: { ...s.filters, [group]: next } };
    });
  }

  computeFiltered() {
    const f = this.state.filters;
    const q = this.normaliza(this.state.query.trim());
    return this.allData().filter(it => {
      const uso = this.usoDe(it.id);
      if (f.tipo.length && !f.tipo.includes(it.tipo)) return false;
      if (f.area.length && !f.area.includes(it.categoria)) return false;
      if (f.escopo.length && !uso.some(u => f.escopo.includes(u.escopoId))) return false;
      if (f.complexidade.length && !f.complexidade.includes(it.complexidade)) return false;
      if (f.status.length && !f.status.includes(it.status)) return false;
      if (f.freq.length && !f.freq.includes(it.freq)) return false;
      if (f.responsavel.length && !f.responsavel.includes(this.respNome(it.responsavel))) return false;
      if (q) {
        // Busca no conteúdo inteiro da ficha, não só no cabeçalho — sem acento e sem caixa.
        const hay = this.normaliza([
          it.nome, it.descricao, it.problema, it.categoria, it.tipo, this.respNome(it.responsavel), it.objetivo,
          ...(it.quandoUsar||[]), ...(it.quandoNao||[]), ...(it.entradas||[]), ...(it.saidas||[]),
          ...(it.passos||[]), ...(it.perguntas||[]), ...(it.cuidados||[]), ...(it.exemplos||[]),
          ...(it.anexos||[]).map(a=>a.nome), ...uso.map(u=>u.escopoNome+' '+u.etapaNome),
        ].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  buildFilterGroups() {
    const data = this.allData();
    const tx = this.TAXONOMIA;
    // Os valores vêm da taxonomia (inclusive os legados: opção com contagem zero some sozinha).
    const groups = [
      { key:'tipo', label:'Tipo de conteúdo', values:Object.keys(tx.tipos) },
      { key:'area', label:'Área de aplicação', field:'categoria', values:Object.keys(tx.categorias) },
      { key:'escopo', label:'Usada no escopo', options:this.ESCOPOS.map(e=>({ value:e.id, label:e.nome })), match:(d,v)=>this.usoDe(d.id).some(u=>u.escopoId===v) },
      { key:'complexidade', label:'Complexidade', values:Object.keys(tx.complexidade) },
      { key:'status', label:'Status', values:Object.keys(tx.status) },
      { key:'freq', label:'Frequência de uso', values:tx.freq },
    ];
    return groups.map(g => {
      const field = g.field || g.key;
      const opts = (g.options || g.values.map(v=>({ value:v, label:v }))).map(o => {
        const count = data.filter(d => g.match ? g.match(d, o.value) : d[field]===o.value).length;
        const active = this.state.filters[g.key].includes(o.value);
        return { value:o.value, label:o.label, count, active, inactive:!active, toggle: ()=>this.toggleFilter(g.key, o.value) };
      }).filter(o => o.count>0 || o.active);
      return { key:g.key, label:g.label, options:opts };
    });
  }

  buildBlocks(it) {
    const o = this.state.open;
    const mk = (key) => ({ open:!!o[key], chevron: o[key]?'rotate(180deg)':'rotate(0deg)', toggle: ()=>this.setState(s=>({open:{...s.open,[key]:!s.open[key]}})) });
    return [
      { key:'quando', num:'1', title:'Quando usar e quando não usar', isDual:true, isSteps:false, isList:false,
        aLabel:'✓ Use quando', aColor:'#2E7D52', aItems:it.quandoUsar||[],
        bLabel:'✕ Evite quando', bColor:'#B23B47', bItems:it.quandoNao||[],
        hint:(it.quandoUsar||[]).length+' situações', ...mk('quando') },
      { key:'passos', num:'2', title:'Passo a passo de aplicação', isSteps:true, isDual:false, isList:false,
        steps:(it.passos||[]).map((t,i)=>({n:i+1,text:t})), hint:(it.passos||[]).length+' passos', ...mk('passos') },
      { key:'io', num:'3', title:'Entradas e saídas', isDual:true, isSteps:false, isList:false,
        aLabel:'Entradas necessárias', aColor:'#1E7C92', aItems:it.entradas||[],
        bLabel:'Saídas esperadas', bColor:'#39795B', bItems:it.saidas||[],
        hint:'', ...mk('io') },
      { key:'perguntas', num:'4', title:'Perguntas-chave', isList:true, isDual:false, isSteps:false,
        items:it.perguntas||[], marker:'?', hint:(it.perguntas||[]).length+' perguntas', ...mk('perguntas') },
      { key:'cuidados', num:'5', title:'Cuidados e erros comuns', isList:true, isDual:false, isSteps:false,
        items:it.cuidados||[], marker:'!', hint:'', ...mk('cuidados') },
      { key:'exemplos', num:'6', title:'Exemplos de aplicação', isList:true, isDual:false, isSteps:false,
        items:it.exemplos||[], marker:'›', hint:'', ...mk('exemplos') },
    ].map(b => ({ headBg: b.open ? '#FBFDFD' : '#fff', ...b }));
  }

  publish() {
    const f = this.state.form;
    if (!f.nome.trim() || !f.descricao.trim()) { this.setState({ toast:'Preencha ao menos nome e descrição.' }); setTimeout(()=>this.setState({toast:''}),2600); return; }
    const id = 'novo-'+Date.now();
    const item = {
      id, nome:f.nome, tipo:f.tipo, categoria:f.categoria, complexidade:f.complexidade,
      tempo:f.tempo||'A definir', status:'Em revisão', freq:'Baixa',
      responsavel:f.responsavel||'Núcleo CIEP', atualizado:this.hoje(), revisao:{ status:'rascunho', revisor:null, data:null },
      descricao:f.descricao, objetivo:f.objetivo||'—', problema:f.problema||'—',
      quandoUsar:['Definir durante a revisão do conteúdo'], quandoNao:['—'],
      entradas:['—'], saidas:['—'], passos:['Conteúdo gerado automaticamente a partir do cadastro.'],
      perguntas:['—'], cuidados:['—'], exemplos:['—'], anexos:[]
    };
    this.setState(s => { const extra = [item, ...s.extra]; this.salvarLocal('hangar.extra', extra); return { extra, toast:'Conteúdo publicado! Página gerada automaticamente.', form:this.formVazio() }; });
    setTimeout(()=>{ this.openContent(id); this.setState({toast:''}); }, 1100);
  }

  goDocs() { this.setState(st=>({ screen:'docs', doc: st.doc || this.defaultDoc() })); if(typeof window!=='undefined') window.scrollTo(0,0); }

  parseAIJson(text) {
    if (!text) throw new Error('empty');
    let t = String(text).trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const a = t.indexOf('{');
    if (a > 0) t = t.slice(a);
    try { return JSON.parse(t); } catch(e) {}
    // salvage truncated JSON: cut to last complete object, then balance brackets
    let s = t;
    const lastBrace = s.lastIndexOf('}');
    if (lastBrace > -1) s = s.slice(0, lastBrace + 1);
    let open = 0, openB = 0, inStr = false, esc = false;
    for (const ch of s) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') open++; else if (ch === '}') open--;
      else if (ch === '[') openB++; else if (ch === ']') openB--;
    }
    while (openB-- > 0) s += ']';
    while (open-- > 0) s += '}';
    s = s.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(s);
  }

  async generateDoc() {
    const d = this.state.doc; const inp = (this.state.aiDocInput||'').trim();
    if (inp.length < 8) { this.setState({ aiError:'Descreva a ferramenta com um pouco mais de detalhe.' }); return; }
    this.setState({ aiLoading:true, aiError:'' });
    const isModelo = d.type === 'modelo';
    const tipoLabel = isModelo ? 'modelo editável (template)' : (d.type==='manual' ? 'manual de uso' : 'metodologia');
    const schema = isModelo
      ? '{"nome":string,"sigla":string,"subtitulo":string curto,"categoria":string,"blocos":[{"titulo":string,"itens":[3 a 4 strings BEM curtas],"w":"normal"|"wide"}]} com 5 a 7 blocos'
      : '{"nome":string,"sigla":string,"subtitulo":string curto,"categoria":string,"intro":string (1 parágrafo de 2 frases),"secoes":[{"grupo":string,"titulo":string,"descricao":string (no máximo 2 frases curtas),"perguntas":[2 strings curtas]}]} com EXATAMENTE 4 seções (no máximo 5) agrupadas logicamente';
    const prompt = 'Você é um consultor sênior da Produtiva Júnior (empresa júnior de consultoria) criando a documentação padronizada de uma ferramenta de consultoria. Com base na descrição macro abaixo, gere uma '+tipoLabel+', em português do Brasil, prática e específica. Responda SOMENTE com JSON válido e COMPLETO, sem comentários, exatamente neste formato: '+schema+'. Seja MUITO conciso (frases curtas) para que a resposta caiba inteira e o JSON feche corretamente.\n\nDescrição macro:\n'+inp;
    try {
      const out = await window.claude.complete({ messages:[{ role:'user', content: prompt }] });
      const j = this.parseAIJson(out);
      const patch = { nome:j.nome||d.nome, sigla:j.sigla||'', subtitulo:j.subtitulo||'', categoria:j.categoria||d.categoria };
      if (isModelo) { patch.blocos = (j.blocos||[]).map(b=>({ titulo:b.titulo||'Bloco', itens:Array.isArray(b.itens)?b.itens:[], w:b.w==='wide'?'wide':'normal' })); }
      else { patch.intro = j.intro||''; patch.secoes = (j.secoes||[]).map(x=>({ grupo:x.grupo||'Geral', titulo:x.titulo||'', descricao:x.descricao||'', perguntas:Array.isArray(x.perguntas)?x.perguntas:[] })); }
      this.updateDoc(patch);
      this.setState({ aiLoading:false });
      this.showToast('Documentação gerada pela IA. Revise e ajuste se quiser.');
    } catch(e) {
      this.setState({ aiLoading:false, aiError:'Não consegui gerar agora. Tente refinar a descrição e gerar de novo.' });
    }
  }

  async generateTool() {
    const inp = (this.state.aiToolInput||'').trim();
    if (inp.length < 8) { this.setState({ aiToolError:'Cole ou descreva o conteúdo da ferramenta primeiro.' }); return; }
    this.setState({ aiToolLoading:true, aiToolError:'' });
    const nomeHint = (this.state.aiToolNome||'').trim();
    const tx = this.TAXONOMIA;
    const en = (arr) => arr.map(v=>'"'+v+'"').join('|');
    const schema = '{"nome":string,"tipo":'+en(this.vivos(tx.tipos))+',"categoria":'+en(this.vivos(tx.categorias))+',"complexidade":'+en(Object.keys(tx.complexidade))+',"tempo":string curto,"descricao":string (1 frase),"objetivo":string (1 frase),"problema":string (1 frase),"quandoUsar":[3 strings curtas],"quandoNao":[2 strings curtas],"entradas":[3 strings curtas],"saidas":[3 strings curtas],"passos":[4 a 5 strings curtas],"perguntas":[3 strings curtas],"cuidados":[2 strings curtas],"exemplos":[2 strings curtas]}';
    const prompt = 'Você é um consultor sênior da Produtiva Júnior. Com base no conteúdo abaixo, estruture uma ferramenta de consultoria para a biblioteca interna, em português do Brasil. Responda SOMENTE com JSON válido e COMPLETO neste formato exato: '+schema+'. Seja específico mas MUITO conciso (frases curtas, itens curtos) para que a resposta caiba inteira e o JSON feche.'+(nomeHint?(' O nome da ferramenta é "'+nomeHint+'".'):'')+'\n\nConteúdo de referência:\n'+inp;
    try {
      const out = await window.claude.complete({ messages:[{ role:'user', content: prompt }] });
      const j = this.parseAIJson(out);
      const id = 'ia-'+Date.now();
      const arr = (v,f)=>Array.isArray(v)&&v.length?v:f;
      const item = {
        id, nome: j.nome || nomeHint || 'Ferramenta gerada', tipo: this.vivos(tx.tipos).includes(j.tipo)?j.tipo:'Ferramenta',
        categoria: this.vivos(tx.categorias).includes(j.categoria)?j.categoria:this.vivos(tx.categorias)[0],
        complexidade: Object.keys(tx.complexidade).includes(j.complexidade)?j.complexidade:'Médio',
        tempo: j.tempo||'A definir', status:'Em revisão', freq:'Baixa',
        responsavel:'Gerado por IA · CIEP', atualizado:this.hoje(), revisao:{ status:'rascunho', revisor:null, data:null },
        descricao: j.descricao||'', objetivo: j.objetivo||'', problema: j.problema||'',
        quandoUsar: arr(j.quandoUsar,['—']), quandoNao: arr(j.quandoNao,['—']),
        entradas: arr(j.entradas,['—']), saidas: arr(j.saidas,['—']), passos: arr(j.passos,['—']),
        perguntas: arr(j.perguntas,['—']), cuidados: arr(j.cuidados,['—']), exemplos: arr(j.exemplos,['—']),
        anexos: [], geradoIA: true
      };
      this.setState(st=>({ extra:[item, ...st.extra], aiToolLoading:false, aiToolInput:'', aiToolNome:'' }));
      this.showToast('Ferramenta gerada por IA e adicionada à biblioteca (em revisão).');
      setTimeout(()=>this.openContent(id), 900);
    } catch(e) {
      this.setState({ aiToolLoading:false, aiToolError:'Não consegui gerar agora. Tente refinar o conteúdo e gerar de novo.' });
    }
  }
  // ===== Cadastro de modelo-padrão de ferramenta (lê anexo) =====
  onModeloFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const nomeGuess = file.name.replace(/\.[a-z0-9]+$/i,'').replace(/^\[[^\]]*\]\s*/,'').replace(/^(modelo|template)\s*[-–]\s*/i,'').trim();
    this.setState(st=>({ modeloFile:{ name:file.name, type:file.type, size:file.size }, modeloError:'', modeloNome: st.modeloNome || nomeGuess }));
  }
  clearModeloFile() { this.setState({ modeloFile:null }); }

  async readModelo() {
    const f = this.state.modeloFile;
    if (!f) { this.setState({ modeloError:'Anexe a imagem ou o PDF do modelo da ferramenta.' }); return; }
    this.setState({ modeloLoading:true, modeloError:'' });
    const nomeHint = (this.state.modeloNome||'').trim() || f.name.replace(/\.[a-z0-9]+$/i,'');
    const schema = '{"nome":string,"sigla":string curto,"layout":"canvas"|"grid","blocos":[{"titulo":string,"dica":string (1 frase do que preencher)}]}';
    const prompt = 'Você é um consultor da Produtiva Júnior cadastrando o MODELO-PADRÃO (formato/layout) de uma ferramenta de consultoria a partir de um anexo enviado (imagem ou PDF) chamado "'+f.name+'"'+(nomeHint?(', referente à ferramenta "'+nomeHint+'"'):'')+'. Extraia o FORMATO da ferramenta: a lista de blocos/quadrantes/seções que a compõem, na ordem do modelo, com uma dica curta do que cada um recebe. Esse formato será usado como PADRÃO para gerar a ferramenta preenchida depois. Use layout "canvas" se a ferramenta é um quadro/canvas de blocos (ex.: Business Model Canvas) e "grid" caso contrário. Responda SOMENTE com JSON válido e COMPLETO neste formato: '+schema+'. Seja conciso.';
    try {
      const out = await window.claude.complete({ messages:[{ role:'user', content: prompt }] });
      const j = this.parseAIJson(out);
      const blocos = (j.blocos||[]).map(b=>({ titulo:b.titulo||'Bloco', dica:b.dica||'' }));
      if (!blocos.length) throw new Error('sem blocos');
      const id = 'mod-'+Date.now();
      const toolMatch = this.allData().find(d => (d.nome||'').toLowerCase() === (j.nome||nomeHint||'').toLowerCase());
      const modelo = { id, toolId: toolMatch?toolMatch.id:null, nome: j.nome||nomeHint||'Modelo de ferramenta', sigla: j.sigla||'', fonte: f.name, layout: j.layout==='canvas'?'canvas':'grid', registrado:'Lido do anexo', blocos };
      this.setState(st=>({ modelos:[modelo, ...st.modelos], modeloLoading:false, modeloFile:null, modeloNome:'' }));
      this.showToast('Modelo-padrão lido e registrado. A IA passará a seguir esse formato.');
    } catch(e) {
      this.setState({ modeloLoading:false, modeloError:'Não consegui ler o modelo agora. Tente outro arquivo ou ajuste o nome.' });
    }
  }
  removeModelo(id) { this.setState(st=>({ modelos: st.modelos.filter(m=>m.id!==id) })); }

  updateDoc(patch) { this.setState(st=>({ doc: { ...st.doc, ...patch } })); }
  setDocType(t) { this.updateDoc({ type:t }); }
  updateSecao(i, patch) { this.setState(st=>{ const secoes=st.doc.secoes.map((x,idx)=>idx===i?{...x,...patch}:x); return { doc:{...st.doc, secoes} }; }); }
  addSecao() { this.setState(st=>({ doc:{...st.doc, secoes:[...st.doc.secoes, { grupo:'Geral', titulo:'Novo bloco', descricao:'Descreva o que este bloco representa na ferramenta.', perguntas:['Pergunta-chave para o preenchimento?'] }]} })); }
  removeSecao(i) { this.setState(st=>({ doc:{...st.doc, secoes: st.doc.secoes.filter((_,idx)=>idx!==i)} })); }
  updateBloco(i, patch) { this.setState(st=>{ const blocos=st.doc.blocos.map((x,idx)=>idx===i?{...x,...patch}:x); return { doc:{...st.doc, blocos} }; }); }
  addBloco() { this.setState(st=>({ doc:{...st.doc, blocos:[...st.doc.blocos, { titulo:'Novo bloco', itens:['Campo de exemplo'], w:'normal' }]} })); }
  removeBloco(i) { this.setState(st=>({ doc:{...st.doc, blocos: st.doc.blocos.filter((_,idx)=>idx!==i)} })); }
  showToast(msg) { this.setState({toast:msg}); setTimeout(()=>this.setState({toast:''}), 2600); }
  exportDoc(fmt) { this.showToast('Documento exportado ('+fmt+'). Pronto para compartilhar.'); }
  saveDocLibrary() {
    const d = this.state.doc; const isModelo = d.type==='modelo';
    const id = 'doc-'+Date.now();
    const anexoNome = d.nome + (isModelo ? ' — Modelo.xlsx' : (d.type==='manual' ? ' — Manual.pdf' : ' — Metodologia.pdf'));
    const anexoTipo = isModelo ? 'Modelo padrão' : 'Metodologia (PDF)';
    const item = {
      id, nome:d.nome, tipo:(isModelo?'Template':'Metodologia'), categoria:d.categoria||'Processos',
      complexidade:'Médio', tempo:'A definir', status:'Em revisão', freq:'Baixa',
      responsavel:'Núcleo CIEP', atualizado:this.hoje(), revisao:{ status:'rascunho', revisor:null, data:null },
      descricao: d.subtitulo || (d.intro.split('\n')[0]||'Documento gerado pela plataforma.').slice(0,140),
      objetivo: d.intro.split('\n')[0] || '—',
      problema: 'Padronizar a documentação e o uso da ferramenta nos projetos.',
      quandoUsar: isModelo ? ['Ao aplicar a ferramenta no projeto'] : (d.secoes.slice(0,3).map(x=>x.titulo)),
      quandoNao:['—'], entradas:['—'], saidas: isModelo ? d.blocos.map(b=>b.titulo) : ['—'],
      passos: isModelo ? ['Preencha cada bloco do modelo conforme o projeto.'] : d.secoes.map((x,i)=>(i+1<10?'0':'')+(i+1)+'. '+x.titulo),
      perguntas: isModelo ? ['—'] : (d.secoes[0]?d.secoes[0].perguntas:['—']),
      cuidados:['—'], exemplos:['—'],
      anexos:[{nome:anexoNome, tipo:anexoTipo, descricao:'Documento gerado automaticamente pela plataforma.', versao:'v1.0', data:this.hoje()}]
    };
    this.setState(st=>({ extra:[item, ...st.extra] }));
    this.showToast('Documentação salva na biblioteca!');
    setTimeout(()=>{ this.openContent(id); }, 1000);
  }

  renderVals() {
    const s = this.state;
    const data = this.allData();
    const dec = (it) => it ? this.decorate(it) : null;

    // nav
    const navDef = [{key:'home',label:'Início'},{key:'comece',label:'Comece aqui'},{key:'biblioteca',label:'Biblioteca'},{key:'escopos',label:'Escopos'},{key:'cases',label:'Cases'},{key:'cadastro',label:'Cadastrar'},{key:'docs',label:'Documentação'}];
    const navItems = navDef.map(n => {
      const active = s.screen===n.key || (n.key==='biblioteca' && s.screen==='conteudo') || (n.key==='cases' && (s.screen==='case' || s.screen==='novo-case'));
      return { label:n.label, go: n.key==='docs' ? ()=>this.goDocs() : ()=>this.nav(n.key), bg: active?'#EAF6F9':'transparent', color: active?'#1E7C92':'#5E747B', weight: active?'600':'500' };
    });

    // home sections — nada de contador fictício: escopos ativos, atualizações reais e uso frequente.
    const decEscopo = (e) => {
      const g = this.TAXONOMIA.gruposEscopo[e.grupo] || { cor:'#1E7C92', bg:'#EAF6F9', label:e.grupo };
      const ferrIds = new Set(); for (const et of (e.etapas||[])) for (const f of (et.ferramentas||[])) ferrIds.add(f);
      return { ...e, grupoLabel:g.label, grupoCor:g.cor, grupoBg:g.bg, ativo:e.status==='ativo', despriorizado:e.status!=='ativo',
        statusLabel: e.status==='ativo' ? 'Ativo' : 'Despriorizado',
        nEtapas:(e.etapas||[]).length, nFerr:ferrIds.size, respNome:this.respNome(e.responsavel),
        resumo:(e.etapas||[]).length+' etapas · '+ferrIds.size+' ferramentas', pick:()=>this.openEscopo(e.id) };
    };
    const porEscopo = this.ESCOPOS.filter(e=>e.status==='ativo').slice(0,3).map(decEscopo);
    const novidades = [...data].sort((a,b)=>String(b.atualizado||'').localeCompare(String(a.atualizado||''))).slice(0,3).map(dec);
    const recomendados = data.filter(d=>d.freq==='Alta' && d.status==='Ativo').slice(0,3).map(dec);

    const quickChips = this.vivos(this.TAXONOMIA.tipos)
      .map(t => ({ label:this.TAXONOMIA.tipos[t].label||t, tipo:t, dot:this.TAXONOMIA.tipos[t].color, go:()=>this.setState({ screen:'biblioteca', filters:{...s.filters, tipo:[t]} }) }))
      .concat([{ label:'Escopos', dot:'#4E5E96', go:()=>this.nav('escopos') }, { label:'Cases', dot:'#B23B47', go:()=>this.nav('cases') }]);

    // cases
    const decCase = (c) => this.decorateCase(c);
    const casesTodos = this.allCases();
    const casesList = this.computeCases().sort((a,b)=>String(b.atualizado||'').localeCompare(String(a.atualizado||''))).map(decCase);
    const casesRecentes = casesTodos.slice().sort((a,b)=>String(b.atualizado||'').localeCompare(String(a.atualizado||''))).slice(0,3).map(decCase);
    const caseFilterGroups = this.buildCaseFilters();
    const caseActiveChips = [];
    caseFilterGroups.forEach(g => g.options.filter(o=>o.active).forEach(o => caseActiveChips.push({ label:o.label, remove:o.toggle })));
    const caseRaw = s.caseId ? casesTodos.find(c => c.id === s.caseId) : null;
    const caseSel = caseRaw ? decCase(caseRaw) : null;
    const confirmRemoverCase = s.confirmRemoverId ? casesTodos.find(c => c.id === s.confirmRemoverId) : null;
    // formulário de case
    const fcase = s.formCase;
    const setFC = (k) => (e) => this.setState(st => ({ formCase: { ...st.formCase, [k]: e.target.value }, caseErro:'' }));
    const fc = {}; for (const k of ['cliente','segmento','porte','cidade','escopoId','escopoNome','inicio','fim','duracaoDias','gerenteNome','gerenteEmail','gerenteZap','c1Nome','c1Email','c1Zap','c2Nome','c2Email','c2Zap','resumo','desafio','solucao','resultados','aprendizados','depoimento','tags','fotoLink','fotoLegenda','videoUrl','videoQuem','videoDuracao','meuNome','meuEmail']) fc[k] = setFC(k);
    const escopoOptions = [{ value:'', label:'Escolha o escopo…' }].concat(this.ESCOPOS.map(e => ({ value:e.id, label:e.nome }))).concat([{ value:'', label:'Outro (descrever abaixo)' }]);
    const porteOptions = [{ value:'', label:'Porte…' }].concat(this.vivos(this.TAXONOMIA.portes || []).map(v => ({ value:v, label:v })));
    const docTipoOptions = this.vivos(this.TAXONOMIA.documentosCase || []).map(v => ({ value:v, label:v }));
    const filtroFerr = this.normaliza(s.caseFiltroFerr);
    const ferrChips = data.filter(d => !filtroFerr || this.normaliza(d.nome).includes(filtroFerr)).map(d => {
      const ativo = fcase.ferramentas.includes(d.id);
      return { id:d.id, nome:d.nome, ativo, inativo:!ativo, bg: ativo?'#EAF6F9':'#fff', border: ativo?'#3DAFC7':'#DCE7EB', color: ativo?'#1E7C92':'#3C545B',
        toggle: () => this.setState(st => ({ formCase: { ...st.formCase, ferramentas: ativo ? st.formCase.ferramentas.filter(x=>x!==d.id) : st.formCase.ferramentas.concat(d.id) } })) };
    });
    const docsRows = fcase.documentos.map((d, i) => { const isPdf = /^data:application\/pdf/.test(d.url || ''); return { ...d, idx:i, n:i+1, isPdf, semPdf:!isPdf,
      setNome: (e) => this.setState(st => ({ formCase: { ...st.formCase, documentos: st.formCase.documentos.map((x,j)=>j===i?{...x,nome:e.target.value}:x) } })),
      setTipo: (e) => this.setState(st => ({ formCase: { ...st.formCase, documentos: st.formCase.documentos.map((x,j)=>j===i?{...x,tipo:e.target.value}:x) } })),
      setUrl: (e) => this.setState(st => ({ formCase: { ...st.formCase, documentos: st.formCase.documentos.map((x,j)=>j===i?{...x,url:e.target.value}:x) } })),
      remove: () => this.setState(st => ({ formCase: { ...st.formCase, documentos: st.formCase.documentos.filter((_,j)=>j!==i) } })),
      pdfKB: isPdf ? Math.round(d.url.length * 0.75 / 1024) : 0,
      anexarPdf: () => this.abrirSeletorDocPdf(i), onPdfArquivo: (e) => this.onDocPdfArquivo(i, e), removerPdf: () => this.removerDocPdf(i),
      tipoOptions: docTipoOptions.map(o => ({ ...o, selected: o.value===d.tipo })) }; });
    const videoPreview = this.embedDe(fcase.videoUrl);
    const fotoPreview = this.fotoSrc(fcase.fotoDados || fcase.fotoLink);
    const fotoFonte = fcase.fotoDados ? 'Foto enviada do seu computador · vai dentro do arquivo do case (' + Math.round(fcase.fotoDados.length * 0.75 / 1024) + ' KB)' : (fcase.fotoLink ? 'Foto pelo link do Drive · quem abrir precisa ter acesso ao arquivo' : '');
    const casePreview = (() => { try { return this.validarCase(fcase) ? null : this.montarCase(fcase); } catch (e) { return null; } })();

    // escopos
    const gruposEscopo = this.TAXONOMIA.gruposEscopo;
    const escoposPorGrupo = Object.keys(gruposEscopo).map(g => ({
      grupo:g, label:gruposEscopo[g].label||g, cor:gruposEscopo[g].cor, bg:gruposEscopo[g].bg,
      escopos:this.ESCOPOS.filter(e=>e.grupo===g).sort((a,b)=>(a.status==='ativo'?0:1)-(b.status==='ativo'?0:1)).map(decEscopo),
    })).filter(g => g.escopos.length);
    const escopoRaw = s.escopoId ? this.ESCOPOS.find(e=>e.id===s.escopoId) : null;
    const escopoSel = escopoRaw ? { ...decEscopo(escopoRaw), cases: casesTodos.filter(c => c.escopoId === escopoRaw.id).map(decCase), hasCases: casesTodos.some(c => c.escopoId === escopoRaw.id) } : null;
    const escopoEtapas = escopoRaw ? (escopoRaw.etapas||[]).map((et,i,arr) => {
      const ferramentas = (et.ferramentas||[]).map(fid=>dec(data.find(d=>d.id===fid))).filter(Boolean);
      return { ...et, num:(et.ordem<10?'0':'')+et.ordem, ferramentas, hasFerramentas:ferramentas.length>0, semFerramentas:ferramentas.length===0,
        entregaveis:et.entregaveis||[], hasEntregaveis:!!(et.entregaveis&&et.entregaveis.length), hasDuracao:!!et.duracaoRef, duracaoRef:et.duracaoRef||'',
        ultima:i===arr.length-1, linhaBg:i===arr.length-1?'transparent':'#DCE7EB' };
    }) : [];

    // biblioteca
    const filtered = this.computeFiltered().map(dec);
    const filterGroups = this.buildFilterGroups();
    const cardStyles = ['detalhado','compacto','visual'].map(k => ({
      label: k==='detalhado'?'Detalhado':k==='compacto'?'Lista':'Visual',
      set: ()=>this.setState({cardStyle:k}),
      bg: s.cardStyle===k?'#fff':'transparent',
      color: s.cardStyle===k?'#163B45':'#7C9097',
      shadow: s.cardStyle===k?'0 1px 3px rgba(22,59,69,0.12)':'none'
    }));
    const activeChips = [];
    const rotulo = (g,v) => g==='escopo' ? ((this.ESCOPOS.find(e=>e.id===v)||{}).nome||v) : v;
    Object.keys(s.filters).forEach(g => s.filters[g].forEach(v => activeChips.push({ value:v, label:rotulo(g,v), remove:()=>this.toggleFilter(g,v) })));

    // conteudo
    const selRaw = data.find(d=>d.id===s.selId);
    // Anexos apontam para o Drive: o bundle não carrega arquivo nenhum, só o link.
    const decAnexo = (a) => {
      const st = this.ANEXO_STYLE[a.tipo] || this.ANEXO_STYLE['Material complementar'] || { bg:'#EFF4F5', color:'#5E747B' };
      const url = typeof a.url === 'string' && /^https:\/\//.test(a.url) ? a.url : '';
      return { ...a, bg:st.bg, color:st.color, ext:this.extOf(a), dataFmt:this.fmtData(a.data), hasUrl:!!url, semUrl:!url,
        btnLabel: url ? 'Abrir no Drive' : 'Arquivo não localizado',
        abrir: (e) => { if(e&&e.stopPropagation)e.stopPropagation(); if (url && typeof window!=='undefined') window.open(url, '_blank', 'noopener'); } };
    };
    const revisaoTexto = (it) => {
      const r = it && it.revisao;
      if (!r) return 'Conteúdo herdado do MVP · sem revisão';
      if (r.status==='aprovado') return 'Aprovado por '+(r.revisor||'').split('@')[0]+' · '+this.fmtData(r.data)+(r.proximaRevisao ? ' · revisar até '+this.fmtData(r.proximaRevisao) : '');
      return 'Rascunho · aguardando revisão';
    };
    const sel = selRaw ? { ...dec(selRaw), respInitials:this.initials(this.respNome(selRaw.responsavel)), anexos:(selRaw.anexos||[]).map(decAnexo), revisaoTexto:revisaoTexto(selRaw),
      pendencias:selRaw.pendencias||[], hasPendencias:!!(selRaw.pendencias&&selRaw.pendencias.length),
      hasCanvas: this.state.modelos.some(m => m.toolId === selRaw.id && m.layout === 'canvas' && (m.blocos||[]).length > 0),
      abrirMaterial: () => this.abrirMaterial(selRaw), baixarMaterial: () => this.baixarMaterial(selRaw), cases: casesTodos.filter(c => (c.ferramentas||[]).includes(selRaw.id)).map(decCase), hasCases: casesTodos.some(c => (c.ferramentas||[]).includes(selRaw.id)) } : null;
    const blocks = selRaw ? this.buildBlocks(selRaw) : [];

    // anexos modal
    const anexFor = data.find(d=>d.id===s.anexosId);
    const anexosList = anexFor ? (anexFor.anexos||[]).map(decAnexo) : [];

    // cadastro
    const setF = (k)=>(e)=>this.setState(st=>({form:{...st.form,[k]:e.target.value}}));
    const tipoOptions = this.vivos(this.TAXONOMIA.tipos).map(v=>({ value:v }));
    const categoriaOptions = this.vivos(this.TAXONOMIA.categorias).map(v=>({ value:v }));
    const complexOptions = Object.keys(this.COMPLEX_STYLE).map(c=>{
      const active = s.form.complexidade===c; const cs=this.COMPLEX_STYLE[c];
      return { label:c, set:()=>this.setState(st=>({form:{...st.form,complexidade:c}})), border: active?cs.color:'#DCE7EB', bg: active?cs.bg:'#fff', color: active?cs.color:'#7C9097' };
    });
    const formSteps = [
      {n:'1',label:'Informações básicas',done:true},
      {n:'2',label:'Detalhamento',done:false},
      {n:'3',label:'Anexos',done:false},
    ].map((fs,i)=>({ ...fs, bg:i===0?'#3DAFC7':'#EEF3F5', color:i===0?'#fff':'#9DAEB4', labelColor:i===0?'#163B45':'#9DAEB4' }));

    // recomendar
    const problemas = this.PROBLEMAS.map(p=>{
      const active = s.recoKey===p.key;
      return { label:p.label, pick:()=>this.setState({recoKey:p.key}), border: active?'#3DAFC7':'#E2EBEE', bg: active?'#EAF6F9':'#fff', color: active?'#1E7C92':'#3C545B' };
    });
    const recoDef = this.PROBLEMAS.find(p=>p.key===s.recoKey);
    const recoResults = recoDef ? recoDef.ids.map(id=>dec(data.find(d=>d.id===id))).filter(Boolean) : [];

    // documentação
    const doc = s.doc || this.defaultDoc();
    const GROUP_COLOR = this.TAXONOMIA.gruposDoc;
    const docIsModelo = false;
    const docEyebrow = 'METODOLOGIA';
    const updField = (k)=>(e)=>this.updateDoc({[k]:e.target.value});
    const secoesEdit = doc.secoes.map((sec,i)=>({
      ...sec, idx:i, num:(i+1<10?'0':'')+(i+1), perguntasText:(sec.perguntas||[]).join('\n'),
      setGrupo:(e)=>this.updateSecao(i,{grupo:e.target.value}),
      setTitulo:(e)=>this.updateSecao(i,{titulo:e.target.value}),
      setDescricao:(e)=>this.updateSecao(i,{descricao:e.target.value}),
      setPerguntas:(e)=>this.updateSecao(i,{perguntas:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)}),
      remove:()=>this.removeSecao(i)
    }));
    let prevG=null;
    const secoesPrev = doc.secoes.map((sec,i)=>{
      const showGroup = sec.grupo!==prevG; prevG=sec.grupo;
      return { ...sec, num:(i+1<10?'0':'')+(i+1), showGroup, grupoColor:GROUP_COLOR[sec.grupo]||'#1E7C92', descParas:(sec.descricao||'').split('\n').filter(Boolean), perguntas:sec.perguntas||[] };
    });
    const introParas = (doc.intro||'').split('\n').filter(Boolean);
    const blocosEdit = doc.blocos.map((b,i)=>({
      ...b, idx:i, itensText:(b.itens||[]).join('\n'), isWide:b.w==='wide', isNormal:b.w!=='wide',
      setTitulo:(e)=>this.updateBloco(i,{titulo:e.target.value}),
      setItens:(e)=>this.updateBloco(i,{itens:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)}),
      setNormal:()=>this.updateBloco(i,{w:'normal'}), setWide:()=>this.updateBloco(i,{w:'wide'}),
      remove:()=>this.removeBloco(i)
    }));
    const blocosPrev = doc.blocos.map((b)=>({ ...b, span:b.w==='wide'?'span 2':'span 1', itens:b.itens||[] }));

    // cadastro — modelos-padrão registrados
    const tabBtn = (mode)=>({ bg: s.cadMode===mode?'#fff':'transparent', color: s.cadMode===mode?'#163B45':'#7C9097', shadow: s.cadMode===mode?'0 1px 3px rgba(22,59,69,0.12)':'none' });
    const modelosList = s.modelos.map(m=>{
      const tool = m.toolId ? this.allData().find(d=>d.id===m.toolId) : null;
      return {
        ...m, isCanvas:m.layout==='canvas', isGrid:m.layout!=='canvas', blocoCount:m.blocos.length,
        layoutLabel: m.layout==='canvas' ? 'Canvas / quadro' : 'Blocos em grade',
        vinculo: tool ? ('Usado por '+tool.nome) : 'Modelo avulso',
        chips: m.blocos.map(b=>b.titulo),
        remove:()=>this.removeModelo(m.id)
      };
    });

    // apply (criar com IA na página da ferramenta) — layout do resultado
    const ar = s.applyResult;
    const applyIsCanvas = !!(ar && ar.layout==='canvas');
    const applyCanvasCells = applyIsCanvas ? ar.blocos.map(b=>({ titulo:b.titulo, itens:b.itens||[], gc:b.gc||'auto', gr:b.gr||'auto' })) : [];

    return {
      // routing
      isHome: s.screen==='home', isBiblioteca: s.screen==='biblioteca', isConteudo: s.screen==='conteudo',
      isCadastro: s.screen==='cadastro', isRecomendar: s.screen==='recomendar', isEscopos: s.screen==='escopos',
      isCases: s.screen==='cases', isCase: s.screen==='case', isNovoCase: s.screen==='novo-case',
      goCases:()=>this.nav('cases'), goNovoCase:()=>this.openNovoCase(),
      // ritual trimestral: painel do CIEP
      ...this.revisoesVals(),
      // trilha do primeiro projeto + glossário
      isComece: s.screen==='comece', goComece:()=>this.nav('comece'), ...this.trilhaVals(s, data, dec),
      // filtros no celular (biblioteca e cases) e iniciais de quem usa
      filtrosClass: s.filtrosAbertos ? 'hg-open' : '', filtrosLabel: s.filtrosAbertos ? 'Ocultar filtros' : 'Filtros', toggleFiltros:()=>this.setState(st=>({ filtrosAbertos: !st.filtrosAbertos })),
      hasEu: !!(s.eu && s.eu.nome), euNome: (s.eu && s.eu.nome) || '', euIniciais: s.eu && s.eu.nome ? this.initials(s.eu.nome) : '',
      // banco de cases
      casesList, casesCount: casesList.length, semCases: casesTodos.length===0, semResultadoCases: casesTodos.length>0 && casesList.length===0,
      caseFilterGroups, caseActiveChips, hasCaseFilters: caseActiveChips.length>0, clearCaseFilters:()=>this.setState({ caseFilters:{ escopo:[], segmento:[], ano:[], ferramenta:[] } }),
      caseQuery: s.caseQuery, onCaseQuery:(e)=>this.setState({ caseQuery:e.target.value }),
      caseSel, hasCaseSel: !!caseSel, casesRecentes, hasCasesRecentes: casesRecentes.length>0,
      confirmRemoverAberto: !!confirmRemoverCase, confirmRemoverNome: confirmRemoverCase ? confirmRemoverCase.cliente : '',
      confirmRemover:()=>this.removerCase(s.confirmRemoverId), cancelarRemover:()=>this.cancelarRemoverCase(),
      // formulário de case
      formCase: fcase, fc, escopoOptions, porteOptions, docTipoOptions, ferrChips, caseFiltroFerr: s.caseFiltroFerr, onCaseFiltroFerr:(e)=>this.setState({ caseFiltroFerr:e.target.value }),
      nFerrEscolhidas: fcase.ferramentas.length, docsRows, addDoc:()=>this.setState(st=>({ formCase:{ ...st.formCase, documentos: st.formCase.documentos.concat([{ nome:'', tipo:docTipoOptions[0]?docTipoOptions[0].value:'Outro', url:'' }]) } })),
      videoPreview, hasVideoPreview: !!videoPreview, caseErro: s.caseErro, hasCaseErro: !!s.caseErro,
      fotoPreview, hasFotoPreview: !!fotoPreview, semFotoPreview: !fotoPreview, fotoFonte,
      onFotoArquivo:(e)=>this.onFotoArquivo(e), onFotoDrop:(e)=>this.onFotoDrop(e), onFotoDragOver:(e)=>this.onFotoDragOver(e), abrirSeletorFoto:()=>this.abrirSeletorFoto(), removerFoto:()=>this.removerFoto(),
      publishCase:()=>this.publishCase(), baixarCaseForm:()=>{ const erro=this.validarCase(fcase); if (erro) { this.setState({caseErro:erro}); return; } this.baixarJson(this.montarCase(fcase)); }, copiarCaseForm:()=>{ const erro=this.validarCase(fcase); if (erro) { this.setState({caseErro:erro}); return; } this.copiarJson(this.montarCase(fcase)); },
      casePronto: !!casePreview, limparCase:()=>this.setState({ formCase:this.formCaseVazio(), caseErro:'' }),
      goHome:()=>this.nav('home'), goBiblioteca:()=>this.nav('biblioteca'), goRecomendar:()=>this.nav('recomendar'), goEscopos:()=>this.nav('escopos'),
      // escopos
      escoposPorGrupo, hasEscopoSel: !!escopoSel, noEscopoSel: !escopoSel, escopoSel, escopoEtapas,
      escoposCount: this.ESCOPOS.length, semEscopos: this.ESCOPOS.length===0,
      navItems,
      // search
      query: s.query,
      onSearchInput:(e)=>this.setState({query:e.target.value}),
      onSearchKey:(e)=>{ if(e.key==='Enter') this.nav('biblioteca'); },
      runSearch:()=>this.nav('biblioteca'),
      quickChips,
      // home
      porEscopo, hasPorEscopo: porEscopo.length>0, novidades, recomendados, hasRecomendados: recomendados.length>0, semRecomendados: recomendados.length===0,
      atalhos: [
        { label:'Qual ferramenta usar?', hint:'Escolha o problema e veja as sugestões', go:()=>this.nav('recomendar') },
        { label:'Registrar um case', hint:'Projeto finalizado vira referência', go:()=>this.openNovoCase() },
        { label:'Ver os escopos', hint:'Etapas e ferramentas de cada linha de serviço', go:()=>this.nav('escopos') },
      ],
      // biblioteca
      filtered, filterGroups, cardStyles,
      resultCount: filtered.length, noResults: filtered.length===0,
      isDetalhado: s.cardStyle==='detalhado', isCompacto: s.cardStyle==='compacto', isVisual: s.cardStyle==='visual',
      hasActiveFilters: activeChips.length>0, activeChips, clearFilters:()=>this.setState({filters:{tipo:[],area:[],escopo:[],complexidade:[],status:[],freq:[],responsavel:[]}}),
      // conteudo
      sel, blocks,
      openSelAnexos:()=>this.setState({anexosId:s.selId}),
      notRated: s.rating===null, rated: s.rating!==null,
      rateUp:()=>this.setState({rating:'up'}), rateDown:()=>this.setState({rating:'down'}),
      feedback: s.feedback, onFeedbackInput:(e)=>this.setState({feedback:e.target.value}),
      // aplicar com IA (preencher ferramenta)
      applyToolName: sel ? sel.nome : '',
      applyInputVal: s.applyInput, setApplyInput:(e)=>this.setState({applyInput:e.target.value}),
      applyLoading: s.applyLoading, applyNotLoading: !s.applyLoading,
      applyError: s.applyError, hasApplyError: !!s.applyError,
      generateApply:()=>this.generateApply(),
      applyOpen: s.applyOpen, closeApply:()=>this.setState({applyOpen:false}),
      regenApply:()=>{ this.setState({applyOpen:false}); this.generateApply(); },
      applyResultTitle: s.applyResult ? s.applyResult.titulo : '',
      applyResultBlocos: s.applyResult ? s.applyResult.blocos : [],
      applyIsCanvas, applyIsList: !applyIsCanvas, applyCanvasCells,
      applyModeloNome: ar ? (ar.modeloNome||'') : '', applyModeloFonte: ar ? (ar.modeloFonte||'') : '', hasApplyModelo: !!(ar && ar.modeloNome),
      exportApply:()=>this.showToast('Ferramenta preenchida exportada. Pronta para o projeto.'),
      // anexos
      anexosOpen: !!anexFor, anexosTitle: anexFor?anexFor.nome:'', anexosList,
      closeAnexos:()=>this.setState({anexosId:null}), stop:(e)=>e.stopPropagation(),
      // cadastro
      form: s.form, complexOptions, tipoOptions, categoriaOptions, formSteps,
      formNome:setF('nome'), formTipo:setF('tipo'), formCategoria:setF('categoria'), formDescricao:setF('descricao'),
      formObjetivo:setF('objetivo'), formProblema:setF('problema'), formTempo:setF('tempo'), formResp:setF('responsavel'),
      publish:()=>this.publish(),
      // recomendar
      problemas, hasReco: !!recoDef, recoLabel: recoDef?recoDef.label:'', recoResults,
      // documentação — IA
      aiDocInputVal: s.aiDocInput, setAiDocInput:(e)=>this.setState({aiDocInput:e.target.value}),
      aiLoading: s.aiLoading, aiNotLoading: !s.aiLoading, aiError: s.aiError, hasAiError: !!s.aiError,
      generateDoc:()=>this.generateDoc(),
      aiBtnLabel: 'Gerar documentação automática',
      // cadastro — abas
      isCadIA: s.cadMode==='ia', isCadManual: s.cadMode==='manual', isCadModelo: s.cadMode==='modelo',
      setCadIA:()=>this.setState({cadMode:'ia'}), setCadManual:()=>this.setState({cadMode:'manual'}), setCadModelo:()=>this.setState({cadMode:'modelo'}),
      cadIaBg: tabBtn('ia').bg, cadIaColor: tabBtn('ia').color, cadIaShadow: tabBtn('ia').shadow,
      cadManBg: tabBtn('manual').bg, cadManColor: tabBtn('manual').color, cadManShadow: tabBtn('manual').shadow,
      cadModeloBg: tabBtn('modelo').bg, cadModeloColor: tabBtn('modelo').color, cadModeloShadow: tabBtn('modelo').shadow,
      aiToolInputVal: s.aiToolInput, setAiToolInput:(e)=>this.setState({aiToolInput:e.target.value}),
      aiToolNomeVal: s.aiToolNome, setAiToolNome:(e)=>this.setState({aiToolNome:e.target.value}),
      aiToolLoading: s.aiToolLoading, aiToolNotLoading: !s.aiToolLoading, aiToolError: s.aiToolError, hasAiToolError: !!s.aiToolError,
      generateTool:()=>this.generateTool(),
      // cadastro — modelo-padrão de ferramenta
      modelosList,
      modeloNomeVal: s.modeloNome, setModeloNome:(e)=>this.setState({modeloNome:e.target.value}),
      modeloFile: s.modeloFile, hasModeloFile: !!s.modeloFile, noModeloFile: !s.modeloFile, modeloFileName: s.modeloFile?s.modeloFile.name:'',
      onModeloFile:(e)=>this.onModeloFile(e), clearModeloFile:()=>this.clearModeloFile(),
      modeloLoading: s.modeloLoading, modeloNotLoading: !s.modeloLoading, modeloError: s.modeloError, hasModeloError: !!s.modeloError,
      readModelo:()=>this.readModelo(),
      // documentação
      isDocs: s.screen==='docs',
      docNomeVal: doc.nome, docSiglaVal: doc.sigla, docSubtituloVal: doc.subtitulo, docCategoriaVal: doc.categoria, docIntroVal: doc.intro,
      docIsModelo, docIsSectioned: true, docEyebrow, docDate:'Junho de 2026',
      docNome:updField('nome'), docSigla:updField('sigla'), docSubtitulo:updField('subtitulo'), docIntro:updField('intro'), docCategoria:updField('categoria'),
      secoesEdit, secoesPrev, introParas, addSecao:()=>this.addSecao(),
      docCount: doc.secoes.length,
      exportPdf:()=>this.exportDoc('PDF'), saveDoc:()=>this.saveDocLibrary(),
      // toast
      toastOpen: !!s.toast, toastMsg: s.toast,
    };
  }
}
