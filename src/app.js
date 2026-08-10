class Component extends DCLogic {
  state = {
    screen: 'home',
    query: '',
    filters: { tipo: [], area: [], etapa: [], complexidade: [], status: [], freq: [], responsavel: [] },
    cardStyle: 'detalhado',
    selId: null,
    open: {},
    rating: null,
    feedback: '',
    anexosId: null,
    recoKey: null,
    toast: '',
    form: { nome:'', tipo:'Ferramenta', categoria:'Estratégia', descricao:'', objetivo:'', problema:'', etapa:'Diagnóstico', complexidade:'Médio', tempo:'', responsavel:'' },
    extra: [],
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
    modeloError: '',
    // importar documento → página da Biblioteca
    docs: [],
    docFile: null,
    docBase64: '',
    docTexto: '',
    docTituloHint: '',
    docCategoria: 'Processos',
    docPreview: null,
    docLoading: false,
    docError: '',
    selDocId: null
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

  TIPO_STYLE = {
    'Ferramenta':{bg:'#EAF6F9',color:'#1E7C92',visual:'#E4F3F7'},
    'Metodologia':{bg:'#EFEDFB',color:'#6A5FB0',visual:'#EEEBFA'},
    'Escopo':{bg:'#ECEFF7',color:'#4E5E96',visual:'#EAEEF7'},
    'Template':{bg:'#E9F4EE',color:'#39795B',visual:'#E7F4ED'},
    'Checklist':{bg:'#FBF0E7',color:'#A5632B',visual:'#FBF0E6'},
    'Documento':{bg:'#EDF1F8',color:'#4A6FA5',visual:'#EBF0F8'},
  };
  COMPLEX_STYLE = {
    'Baixo':{bg:'#E7F4EC',color:'#2E7D52'},
    'Médio':{bg:'#FBF1E0',color:'#9A6B17'},
    'Alto':{bg:'#FBE9EA',color:'#B23B47'},
  };
  STATUS_COLOR = { 'Ativo':'#2E9D5B', 'Em revisão':'#C9942A', 'Arquivado':'#9DAEB4' };
  ANEXO_STYLE = {
    'Template editável':{bg:'#E9F4EE',color:'#39795B',ext:'DOCX'},
    'Exemplo preenchido':{bg:'#EAF6F9',color:'#1E7C92',ext:'PDF'},
    'PDF explicativo':{bg:'#FBE9EA',color:'#B23B47',ext:'PDF'},
    'Material complementar':{bg:'#EFEDFB',color:'#6A5FB0',ext:'PDF'},
  };

  // Documentos importados entram na Biblioteca junto das ferramentas: aparecem
  // na busca e nos filtros, mas abrem a própria página (ver decorate).
  allData() { return this.state.docs.concat(this.state.extra, this.DATA); }
  initials(name) { return (name||'').split(' ').filter(w=>w.length>2).slice(0,2).map(w=>w[0]).join('').toUpperCase() || 'C'; }
  extOf(a) { const m=(a.nome||'').match(/\.([a-z0-9]+)$/i); return m?m[1].toUpperCase():(this.ANEXO_STYLE[a.tipo]?this.ANEXO_STYLE[a.tipo].ext:'DOC'); }

  decorate(it) {
    const ts = this.TIPO_STYLE[it.tipo] || this.TIPO_STYLE['Ferramenta'];
    const cs = this.COMPLEX_STYLE[it.complexidade] || this.COMPLEX_STYLE['Médio'];
    return {
      ...it,
      tipoBg: ts.bg, tipoColor: ts.color, visualBg: ts.visual,
      complexBg: cs.bg, complexColor: cs.color,
      statusColor: this.STATUS_COLOR[it.status] || '#9DAEB4',
      initial: (it.nome||'?')[0].toUpperCase(),
      quandoResumo: (it.quandoUsar && it.quandoUsar[0]) || '',
      anexosCount: (it.anexos||[]).length,
      open: () => it.isDocumento ? this.openDocumento(it.id) : this.openContent(it.id),
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
  nav(screen) { this.setState({ screen }); if(typeof window!=='undefined') window.scrollTo(0,0); }

  toggleFilter(group, value) {
    this.setState(s => {
      const arr = s.filters[group];
      const next = arr.includes(value) ? arr.filter(v=>v!==value) : arr.concat(value);
      return { filters: { ...s.filters, [group]: next } };
    });
  }

  computeFiltered() {
    const f = this.state.filters;
    const q = this.state.query.trim().toLowerCase();
    return this.allData().filter(it => {
      if (f.tipo.length && !f.tipo.includes(it.tipo)) return false;
      if (f.area.length && !f.area.includes(it.categoria)) return false;
      if (f.etapa.length && !f.etapa.includes(it.etapa)) return false;
      if (f.complexidade.length && !f.complexidade.includes(it.complexidade)) return false;
      if (f.status.length && !f.status.includes(it.status)) return false;
      if (f.freq.length && !f.freq.includes(it.freq)) return false;
      if (f.responsavel.length && !f.responsavel.includes(it.responsavel)) return false;
      if (q) {
        const hay = [it.nome,it.descricao,it.problema,it.categoria,it.tipo,it.responsavel,it.etapa,it.objetivo].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  buildFilterGroups() {
    const data = this.allData();
    const groups = [
      { key:'tipo', label:'Tipo de conteúdo', values:['Ferramenta','Metodologia','Escopo','Template','Checklist'] },
      { key:'area', label:'Área de aplicação', field:'categoria', values:['Processos','Estratégia','Financeiro','Marketing','Pessoas','Operações','Comercial','Inovação','Gestão'] },
      { key:'etapa', label:'Etapa do projeto', values:['Diagnóstico','Coleta','Análise','Planejamento','Execução','Validação','Entrega Final'] },
      { key:'complexidade', label:'Complexidade', values:['Baixo','Médio','Alto'] },
      { key:'status', label:'Status', values:['Ativo','Em revisão','Arquivado'] },
      { key:'freq', label:'Frequência de uso', values:['Alta','Média','Baixa'] },
    ];
    return groups.map(g => {
      const field = g.field || g.key;
      const opts = g.values.map(v => {
        const count = data.filter(d => d[field]===v).length;
        const active = this.state.filters[g.key].includes(v);
        return { value:v, count, active, inactive:!active, toggle: ()=>this.toggleFilter(g.key, v) };
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
      id, nome:f.nome, tipo:f.tipo, categoria:f.categoria, etapa:f.etapa, complexidade:f.complexidade,
      tempo:f.tempo||'A definir', status:'Em revisão', freq:'Baixa', acessos:0, nota:'—',
      responsavel:f.responsavel||'Núcleo CIEP', atualizado:'Hoje',
      descricao:f.descricao, objetivo:f.objetivo||'—', problema:f.problema||'—',
      quandoUsar:['Definir durante a revisão do conteúdo'], quandoNao:['—'],
      entradas:['—'], saidas:['—'], passos:['Conteúdo gerado automaticamente a partir do cadastro.'],
      perguntas:['—'], cuidados:['—'], exemplos:['—'], anexos:[]
    };
    this.setState(s => ({ extra:[item, ...s.extra], toast:'Conteúdo publicado! Página gerada automaticamente.', form:{ nome:'', tipo:'Ferramenta', categoria:'Estratégia', descricao:'', objetivo:'', problema:'', etapa:'Diagnóstico', complexidade:'Médio', tempo:'', responsavel:'' } }));
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
    const schema = '{"nome":string,"tipo":"Ferramenta"|"Metodologia"|"Escopo"|"Template"|"Checklist","categoria":"Processos"|"Estratégia"|"Financeiro"|"Marketing"|"Pessoas"|"Operações"|"Comercial"|"Inovação"|"Gestão","etapa":"Diagnóstico"|"Coleta"|"Análise"|"Planejamento"|"Execução"|"Validação"|"Entrega Final","complexidade":"Baixo"|"Médio"|"Alto","tempo":string curto,"descricao":string (1 frase),"objetivo":string (1 frase),"problema":string (1 frase),"quandoUsar":[3 strings curtas],"quandoNao":[2 strings curtas],"entradas":[3 strings curtas],"saidas":[3 strings curtas],"passos":[4 a 5 strings curtas],"perguntas":[3 strings curtas],"cuidados":[2 strings curtas],"exemplos":[2 strings curtas]}';
    const prompt = 'Você é um consultor sênior da Produtiva Júnior. Com base no conteúdo abaixo, estruture uma ferramenta de consultoria para a biblioteca interna, em português do Brasil. Responda SOMENTE com JSON válido e COMPLETO neste formato exato: '+schema+'. Seja específico mas MUITO conciso (frases curtas, itens curtos) para que a resposta caiba inteira e o JSON feche.'+(nomeHint?(' O nome da ferramenta é "'+nomeHint+'".'):'')+'\n\nConteúdo de referência:\n'+inp;
    try {
      const out = await window.claude.complete({ messages:[{ role:'user', content: prompt }] });
      const j = this.parseAIJson(out);
      const id = 'ia-'+Date.now();
      const arr = (v,f)=>Array.isArray(v)&&v.length?v:f;
      const item = {
        id, nome: j.nome || nomeHint || 'Ferramenta gerada', tipo: j.tipo||'Ferramenta', categoria: j.categoria||'Processos',
        etapa: j.etapa||'Análise', complexidade: ['Baixo','Médio','Alto'].includes(j.complexidade)?j.complexidade:'Médio',
        tempo: j.tempo||'A definir', status:'Em revisão', freq:'Baixa', acessos:0, nota:'—',
        responsavel:'Gerado por IA · CIEP', atualizado:'Hoje',
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

  // ===== Importar documento → vira página da Biblioteca =====
  // Formatos de texto (.md, .txt, .csv, .html) são estruturados aqui mesmo, no
  // navegador, sem depender de IA. PDF e .docx precisam de leitura por IA: o
  // arquivo é lido e guardado em base64 para o backend processar (ver README).
  TEXTO_EXT = ['md','markdown','txt','text','csv','tsv','html','htm','json'];
  BINARIO_EXT = ['pdf','docx','doc','odt','rtf','pptx'];

  extensao(nome) { const m = String(nome||'').match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : ''; }

  onDocFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const ext = this.extensao(file.name);
    const meta = { nome: file.name, ext, tamanho: file.size };
    this.setState({ docFile: meta, docLoading: true, docError: '', docPreview: null });

    const reader = new FileReader();
    reader.onerror = () => this.setState({ docLoading: false, docError: 'Não consegui abrir o arquivo. Verifique se ele não está corrompido.' });

    if (this.BINARIO_EXT.includes(ext)) {
      // Guarda o conteúdo para o backend enviar à IA. Sem backend, para aqui —
      // com uma mensagem honesta em vez de fingir que leu.
      reader.onload = () => this.setState({
        docLoading: false,
        docBase64: String(reader.result || '').split(',')[1] || '',
        docError: 'Arquivos ' + ext.toUpperCase() + ' precisam ser lidos por IA, o que exige o servidor da Biblioteca. Por enquanto, exporte o documento como .md ou .txt — ou cole o texto no campo abaixo.'
      });
      reader.readAsDataURL(file);
      return;
    }

    reader.onload = () => {
      const bruto = String(reader.result || '');
      if (!bruto.trim()) { this.setState({ docLoading:false, docError:'O arquivo está vazio.' }); return; }
      try {
        const doc = this.parseDocumento(bruto, file.name, ext);
        this.setState({ docLoading: false, docPreview: doc });
      } catch (err) {
        this.setState({ docLoading: false, docError: 'Não consegui interpretar a estrutura deste arquivo.' });
      }
    };
    reader.readAsText(file);
  }

  clearDocFile() { this.setState({ docFile:null, docPreview:null, docError:'', docBase64:'', docTexto:'' }); }

  lerDocColado() {
    const t = (this.state.docTexto || '').trim();
    if (t.length < 20) { this.setState({ docError:'Cole um pouco mais de conteúdo para eu conseguir estruturar.' }); return; }
    try {
      const doc = this.parseDocumento(t, this.state.docTituloHint || 'Documento colado', 'md');
      this.setState({ docPreview: doc, docError: '' });
    } catch (err) {
      this.setState({ docError: 'Não consegui interpretar a estrutura desse texto.' });
    }
  }

  /** Remove marcação inline (negrito, itálico, código, links) mantendo o texto. */
  limparInline(s) {
    return String(s || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Estrutura texto em seções tipadas — determinístico, sem IA.
   * Reconhece títulos Markdown (#), listas, listas numeradas e tabelas em pipe.
   * HTML tem as tags removidas antes; o resto vira parágrafo.
   */
  parseDocumento(bruto, nomeArquivo, ext) {
    let texto = bruto.replace(/\r\n?/g, '\n');

    if (ext === 'html' || ext === 'htm') {
      texto = texto
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        .replace(/<h([1-6])[^>]*>/gi, (_m, n) => '\n' + '#'.repeat(+n) + ' ')
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }

    const linhas = texto.split('\n');
    const secoes = [];
    let tituloDoc = '';
    let atual = null;
    let buffer = [];

    const classificar = (linhasBloco) => {
      const uteis = linhasBloco.filter(l => l.trim());
      if (!uteis.length) return null;

      const tabela = uteis.filter(l => l.trim().startsWith('|'));
      if (tabela.length >= 2) {
        const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => this.limparInline(c));
        const corpo = tabela.filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l));
        const colunas = celulas(corpo[0]);
        const linhasTab = corpo.slice(1).map(celulas).filter(r => r.some(c => c));
        if (colunas.length && linhasTab.length) return { tipo:'tabela', colunas, linhas: linhasTab };
      }

      const numeradas = uteis.filter(l => /^\s*\d+[.)]\s+/.test(l));
      if (numeradas.length >= 2 && numeradas.length >= uteis.length * 0.6) {
        return { tipo:'passos', itens: numeradas.map(l => this.limparInline(l.replace(/^\s*\d+[.)]\s+/, ''))) };
      }

      const marcadas = uteis.filter(l => /^\s*[-*•+]\s+/.test(l));
      if (marcadas.length >= 2 && marcadas.length >= uteis.length * 0.6) {
        return { tipo:'lista', itens: marcadas.map(l => this.limparInline(l.replace(/^\s*[-*•+]\s+/, ''))) };
      }

      const paragrafos = linhasBloco.join('\n').split(/\n\s*\n/)
        .map(p => this.limparInline(p.replace(/\n/g, ' '))).filter(Boolean);
      return paragrafos.length ? { tipo:'texto', paragrafos } : null;
    };

    const fechar = () => {
      if (!atual) { buffer = []; return; }
      const bloco = classificar(buffer);
      if (bloco) atual.blocos.push(bloco);
      buffer = [];
    };

    for (const linha of linhas) {
      const h = linha.match(/^(#{1,6})\s+(.+)$/);
      // Linha isolada em CAIXA ALTA também conta como título (comum em export de Docs).
      const caps = !h && /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][^a-z]{4,70}$/.test(linha.trim()) && linha.trim().length < 72;

      if (h || caps) {
        const titulo = this.limparInline(h ? h[2] : linha);
        const nivel = h ? h[1].length : 2;
        if (!tituloDoc && nivel === 1) { tituloDoc = titulo; fechar(); atual = null; continue; }
        fechar();
        atual = { titulo, blocos: [] };
        secoes.push(atual);
        continue;
      }
      if (!atual) { atual = { titulo: '', blocos: [] }; secoes.push(atual); }
      buffer.push(linha);
    }
    fechar();

    const comConteudo = secoes.filter(s => s.blocos.length);
    if (!comConteudo.length) throw new Error('sem conteúdo');

    // Sem título explícito, usa o nome do arquivo.
    if (!tituloDoc) {
      tituloDoc = String(nomeArquivo || 'Documento').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
    }
    // Primeira seção sem título vira o resumo de abertura.
    let resumo = '';
    if (comConteudo[0] && !comConteudo[0].titulo) {
      const t = comConteudo[0].blocos.find(b => b.tipo === 'texto');
      if (t) resumo = t.paragrafos[0] || '';
    }

    const totalItens = comConteudo.reduce((n, s) => n + s.blocos.reduce((m, b) =>
      m + (b.itens ? b.itens.length : b.linhas ? b.linhas.length : b.paragrafos.length), 0), 0);

    return {
      titulo: tituloDoc,
      resumo: resumo || 'Documento importado para a Biblioteca.',
      secoes: comConteudo,
      fonte: nomeArquivo || 'texto colado',
      totalSecoes: comConteudo.length,
      totalItens,
    };
  }

  importarDoc() {
    const p = this.state.docPreview;
    if (!p) return;
    const id = 'doc-' + Date.now();
    const item = {
      id,
      isDocumento: true,
      nome: p.titulo,
      tipo: 'Documento',
      categoria: this.state.docCategoria || 'Processos',
      etapa: 'Análise',
      complexidade: 'Médio',
      tempo: '—',
      status: 'Em revisão',
      freq: 'Baixa',
      acessos: 0,
      nota: '—',
      responsavel: 'Importado',
      atualizado: 'Hoje',
      descricao: p.resumo,
      objetivo: '—', problema: '—',
      quandoUsar: [], quandoNao: [], entradas: [], saidas: [],
      passos: [], perguntas: [], cuidados: [], exemplos: [], anexos: [],
      secoes: p.secoes,
      fonteArquivo: p.fonte,
      totalSecoes: p.totalSecoes,
      totalItens: p.totalItens,
    };
    this.setState(st => ({ docs: [item, ...st.docs], docFile: null, docPreview: null, docTexto: '', docError: '' }));
    this.showToast('Documento importado. Página criada na Biblioteca.');
    setTimeout(() => this.openDocumento(id), 700);
  }

  openDocumento(id) {
    this.setState({ screen: 'documento', selDocId: id });
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }

  removeDoc(id) {
    this.setState(st => ({
      docs: st.docs.filter(d => d.id !== id),
      screen: st.selDocId === id ? 'biblioteca' : st.screen,
    }));
    this.showToast('Documento removido da Biblioteca.');
  }

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
    const anexoTipo = isModelo ? 'Template editável' : 'PDF explicativo';
    const item = {
      id, nome:d.nome, tipo:(isModelo?'Template':'Metodologia'), categoria:d.categoria||'Processos', etapa:'Análise',
      complexidade:'Médio', tempo:'A definir', status:'Em revisão', freq:'Baixa', acessos:0, nota:'—',
      responsavel:'Núcleo CIEP', atualizado:'Hoje',
      descricao: d.subtitulo || (d.intro.split('\n')[0]||'Documento gerado pela plataforma.').slice(0,140),
      objetivo: d.intro.split('\n')[0] || '—',
      problema: 'Padronizar a documentação e o uso da ferramenta nos projetos.',
      quandoUsar: isModelo ? ['Ao aplicar a ferramenta no projeto'] : (d.secoes.slice(0,3).map(x=>x.titulo)),
      quandoNao:['—'], entradas:['—'], saidas: isModelo ? d.blocos.map(b=>b.titulo) : ['—'],
      passos: isModelo ? ['Preencha cada bloco do modelo conforme o projeto.'] : d.secoes.map((x,i)=>(i+1<10?'0':'')+(i+1)+'. '+x.titulo),
      perguntas: isModelo ? ['—'] : (d.secoes[0]?d.secoes[0].perguntas:['—']),
      cuidados:['—'], exemplos:['—'],
      anexos:[{nome:anexoNome, tipo:anexoTipo, descricao:'Documento gerado automaticamente pela plataforma.', versao:'v1.0', data:'Hoje'}]
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
    const navDef = [{key:'home',label:'Início'},{key:'biblioteca',label:'Biblioteca'},{key:'cadastro',label:'Cadastrar'},{key:'docs',label:'Documentação'}];
    const navItems = navDef.map(n => {
      const active = s.screen===n.key || (n.key==='biblioteca' && s.screen==='conteudo');
      return { label:n.label, go: n.key==='docs' ? ()=>this.goDocs() : ()=>this.nav(n.key), bg: active?'#EAF6F9':'transparent', color: active?'#1E7C92':'#5E747B', weight: active?'600':'500' };
    });

    // home sections
    const sorted = [...data].sort((a,b)=>b.acessos-a.acessos);
    const maisAcessados = sorted.slice(0,3).map(dec);
    const novidades = [...data].slice(0,3).map(it=>({...dec(it)}));
    const recomendados = ['swot','5w2h','escopo'].map(id=>dec(data.find(d=>d.id===id))).filter(Boolean);

    const quickChips = [
      {label:'Ferramentas',tipo:'Ferramenta',dot:'#1E7C92'},
      {label:'Escopos',tipo:'Escopo',dot:'#4E5E96'},
      {label:'Metodologias',tipo:'Metodologia',dot:'#6A5FB0'},
      {label:'Templates',tipo:'Template',dot:'#39795B'},
      {label:'Checklists',tipo:'Checklist',dot:'#A5632B'},
    ].map(c => ({ ...c, go:()=>this.setState({ screen:'biblioteca', filters:{...s.filters, tipo:[c.tipo]} }) }));

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
    Object.keys(s.filters).forEach(g => s.filters[g].forEach(v => activeChips.push({ value:v, remove:()=>this.toggleFilter(g,v) })));

    // conteudo
    const selRaw = data.find(d=>d.id===s.selId);
    const sel = selRaw ? { ...dec(selRaw), respInitials:this.initials(selRaw.responsavel), anexos:(selRaw.anexos||[]).map(a=>{const st=this.ANEXO_STYLE[a.tipo]||this.ANEXO_STYLE['Template editável'];return {...a,bg:st.bg,color:st.color,ext:this.extOf(a)};}) } : null;
    const blocks = selRaw ? this.buildBlocks(selRaw) : [];

    // anexos modal
    const anexFor = data.find(d=>d.id===s.anexosId);
    const anexosList = anexFor ? (anexFor.anexos||[]).map(a=>{const st=this.ANEXO_STYLE[a.tipo]||this.ANEXO_STYLE['Template editável'];return {...a,bg:st.bg,color:st.color,ext:this.extOf(a)};}) : [];

    // cadastro
    const setF = (k)=>(e)=>this.setState(st=>({form:{...st.form,[k]:e.target.value}}));
    const complexOptions = ['Baixo','Médio','Alto'].map(c=>{
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
    const GROUP_COLOR = { 'Entradas':'#1E7C92','Processos':'#6A5FB0','Saídas':'#39795B','Suporte':'#A5632B' };
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

    // documento importado — página gerada a partir do arquivo
    const docRaw = s.docs.find(d => d.id === s.selDocId) || null;
    const dts = this.TIPO_STYLE['Documento'];
    const docPag = docRaw ? {
      id: docRaw.id, nome: docRaw.nome, resumo: docRaw.descricao, categoria: docRaw.categoria,
      fonte: docRaw.fonteArquivo, status: docRaw.status, atualizado: docRaw.atualizado,
      statusColor: this.STATUS_COLOR[docRaw.status] || '#9DAEB4',
      tipoBg: dts.bg, tipoColor: dts.color,
      totalSecoes: docRaw.totalSecoes, totalItens: docRaw.totalItens,
    } : null;
    // O template precisa de flags por tipo de bloco: <sc-if> não avalia expressões.
    const docPagSecoes = docRaw ? docRaw.secoes.map((sec, i) => ({
      num: (i+1<10?'0':'') + (i+1),
      titulo: sec.titulo || 'Abertura',
      blocos: sec.blocos.map(b => {
        // Tabela vai como grid CSS, não como <table>: o parser de HTML remove
        // elementos estranhos (<sc-for>) de dentro de <table>/<tr> antes de o
        // runtime processá-los, então as linhas nunca chegariam a renderizar.
        const colunas = b.colunas || [];
        const linhas = b.linhas || [];
        return {
          isTexto:  b.tipo === 'texto',
          isLista:  b.tipo === 'lista',
          isPassos: b.tipo === 'passos',
          isTabela: b.tipo === 'tabela',
          paragrafos: b.paragrafos || [],
          itens: b.itens || [],
          passos: (b.itens || []).map((t, j) => ({ n: j+1, text: t })),
          cabecalho: colunas,
          celulas: linhas.flatMap((linha, li) =>
            colunas.map((_, ci) => ({ txt: linha[ci] || '', bg: li % 2 ? '#FBFDFD' : '#fff' }))),
          gridCols: colunas.length ? `repeat(${colunas.length}, minmax(140px, 1fr))` : '1fr',
          minWidth: (colunas.length * 140) + 'px',
        };
      }),
    })) : [];

    return {
      // routing
      isHome: s.screen==='home', isBiblioteca: s.screen==='biblioteca', isConteudo: s.screen==='conteudo',
      isCadastro: s.screen==='cadastro', isRecomendar: s.screen==='recomendar',
      goHome:()=>this.nav('home'), goBiblioteca:()=>this.nav('biblioteca'), goRecomendar:()=>this.nav('recomendar'),
      navItems,
      // search
      query: s.query,
      onSearchInput:(e)=>this.setState({query:e.target.value}),
      onSearchKey:(e)=>{ if(e.key==='Enter') this.nav('biblioteca'); },
      runSearch:()=>this.nav('biblioteca'),
      quickChips,
      // home
      maisAcessados, novidades, recomendados,
      // biblioteca
      filtered, filterGroups, cardStyles,
      resultCount: filtered.length, noResults: filtered.length===0,
      isDetalhado: s.cardStyle==='detalhado', isCompacto: s.cardStyle==='compacto', isVisual: s.cardStyle==='visual',
      hasActiveFilters: activeChips.length>0, activeChips, clearFilters:()=>this.setState({filters:{tipo:[],area:[],etapa:[],complexidade:[],status:[],freq:[],responsavel:[]}}),
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
      form: s.form, complexOptions, formSteps,
      formNome:setF('nome'), formTipo:setF('tipo'), formCategoria:setF('categoria'), formDescricao:setF('descricao'),
      formObjetivo:setF('objetivo'), formProblema:setF('problema'), formEtapa:setF('etapa'), formTempo:setF('tempo'), formResp:setF('responsavel'),
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
      isCadImportar: s.cadMode==='importar', setCadImportar:()=>this.setState({cadMode:'importar'}),
      cadImpBg: tabBtn('importar').bg, cadImpColor: tabBtn('importar').color, cadImpShadow: tabBtn('importar').shadow,
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
      // importar documento
      onDocFile:(e)=>this.onDocFile(e), clearDocFile:()=>this.clearDocFile(),
      docFileName: s.docFile ? s.docFile.nome : '', hasDocFile: !!s.docFile, noDocFile: !s.docFile,
      docLoading: s.docLoading, docNotLoading: !s.docLoading,
      docError: s.docError, hasDocError: !!s.docError,
      docTextoVal: s.docTexto, setDocTexto:(e)=>this.setState({docTexto:e.target.value}),
      docTituloHintVal: s.docTituloHint, setDocTituloHint:(e)=>this.setState({docTituloHint:e.target.value}),
      docCategoriaVal: s.docCategoria, setDocCategoria:(e)=>this.setState({docCategoria:e.target.value}),
      lerDocColado:()=>this.lerDocColado(),
      importarDoc:()=>this.importarDoc(),
      hasDocPreview: !!s.docPreview, noDocPreview: !s.docPreview,
      docPrevTitulo: s.docPreview ? s.docPreview.titulo : '',
      docPrevResumo: s.docPreview ? s.docPreview.resumo : '',
      docPrevFonte: s.docPreview ? s.docPreview.fonte : '',
      docPrevSecoes: s.docPreview ? s.docPreview.totalSecoes : 0,
      docPrevItens: s.docPreview ? s.docPreview.totalItens : 0,
      docPrevLista: s.docPreview ? s.docPreview.secoes.map((sec,i)=>({
        num: (i+1<10?'0':'')+(i+1),
        titulo: sec.titulo || 'Abertura',
        resumo: sec.blocos.map(b => b.tipo==='tabela' ? ('tabela · '+b.linhas.length+' linhas')
          : b.tipo==='passos' ? (b.itens.length+' passos')
          : b.tipo==='lista' ? (b.itens.length+' itens')
          : (b.paragrafos.length+' parágrafo'+(b.paragrafos.length>1?'s':''))).join(' · ')
      })) : [],
      // documentos já importados
      docsList: s.docs.map(d=>({
        id:d.id, nome:d.nome, fonte:d.fonteArquivo, categoria:d.categoria,
        resumo: d.totalSecoes+' seções · '+d.totalItens+' itens',
        abrir:()=>this.openDocumento(d.id), remover:()=>this.removeDoc(d.id),
      })),
      hasDocs: s.docs.length>0, docsCount: s.docs.length,
      // página do documento
      isDocumento: s.screen==='documento',
      docPag: docPag,
      docPagSecoes: docPagSecoes,
      removeDocAtual: docPag ? (()=>this.removeDoc(docPag.id)) : (()=>{}),
      // toast
      toastOpen: !!s.toast, toastMsg: s.toast,
    };
  }
}
