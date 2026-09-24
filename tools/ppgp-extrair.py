#!/usr/bin/env python3
"""
ppgp-extrair.py — extrai, verbatim, os 16 slides de "[PPGP 2026] Revisão dos Escopos" para JSON.

    pip install pdfplumber
    python3 tools/ppgp-extrair.py            # lê fontes/ppgp-2026/revisao-dos-escopos.pdf

Cada slide é uma tabela: quatro caixas no alto (O que estudar · Escopo · Cases/Cronogramas ·
Entregáveis) e uma faixa embaixo dividida em O que saber | Pontos de risco. Os itens são
reconhecidos pelos marcadores (bolinhas desenhadas no PDF); linha sem marcador continua o item
anterior. Linha sem marcador e recuada à esquerda dos marcadores é um subtítulo ("GAMIFICAÇÃO:")
e vira `frente` dos itens seguintes. Nada é corrigido aqui: erros de digitação e caixa alta ficam
como estão no documento. A curadoria (textos corrigidos, ferramentas por etapa) mora em
fontes/escopos-mapa.json e o tools/rascunho.mjs --escopos confere uma contra a outra.
"""
import hashlib, json, os, sys
from datetime import date
import pdfplumber

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PDF = os.path.join(ROOT, 'fontes/ppgp-2026/revisao-dos-escopos.pdf')
OUT = os.path.join(ROOT, 'fontes/ppgp-2026/revisao-dos-escopos.json')
COLUNAS = ['estudar', 'escopo', 'cases', 'entregaveis']


def itens(words, bullets, x0, x1, y0, y1):
    ws = [w for w in words if x0 <= w['x0'] < x1 and y0 <= w['top'] < y1]
    bl = [b for b in bullets if x0 - 5 <= b['x0'] < x1 and y0 - 5 <= b['top'] < y1]
    xb = min((b['x0'] for b in bl), default=None)
    linhas = []
    for w in sorted(ws, key=lambda w: (round(w['top']), w['x0'])):
        for L in linhas:
            if abs(L['top'] - w['top']) < 4:
                L['w'].append(w); break
        else:
            linhas.append({'top': w['top'], 'bottom': w['bottom'], 'w': [w]})
    linhas.sort(key=lambda L: L['top'])
    out, frente = [], None
    for L in linhas:
        pal = sorted(L['w'], key=lambda w: w['x0'])
        txt = ' '.join(w['text'] for w in pal)
        meio = (L['top'] + L['bottom']) / 2
        inicia = any(abs((b['top'] + b['bottom']) / 2 - meio) < 6 for b in bl)
        if not inicia and xb is not None and pal[0]['x0'] < xb:
            frente = txt.rstrip(':').strip(); continue
        if inicia or not out:
            out.append({'texto': txt, **({'frente': frente} if frente else {})})
        else:
            out[-1]['texto'] += ' ' + txt
    return [o if 'frente' in o else o['texto'] for o in out]


def slide(n, p):
    words = [w for w in p.extract_words(extra_attrs=['upright']) if w['upright']]
    caixas = []
    for r in sorted((r for r in p.rects if 100 < r['height'] < 500 and r['width'] < 1420), key=lambda r: (round(r['top']), r['x0'])):
        if not any(abs(r['x0'] - c['x0']) < 5 and abs(r['top'] - c['top']) < 5 for c in caixas):
            caixas.append(r)
    alto = sorted((c for c in caixas if c['top'] < 300), key=lambda c: c['x0'])
    faixa = [c for c in caixas if c['top'] >= 300][0]
    topo = min(c['top'] for c in alto)
    bullets = [c for c in p.curves if (c['x1'] - c['x0']) < 9 and (c['bottom'] - c['top']) < 9]
    rec = {'pagina': n, 'titulo': ' '.join(w['text'] for w in words if w['bottom'] < topo - 30)}
    for nome, c in zip(COLUNAS, alto):
        rec[nome] = itens(words, bullets, c['x0'], c['x1'], c['top'], c['bottom'])
    # "PONTOS DE RISCO" é texto girado: a coluna dele divide a faixa de baixo em duas
    girado = [w for w in p.extract_words(extra_attrs=['upright']) if not w['upright'] and w['top'] >= faixa['top']]
    corte = max(w['x0'] for w in girado)
    rec['saber'] = itens(words, bullets, faixa['x0'] + 40, corte, faixa['top'], faixa['bottom'])
    rec['riscos'] = itens(words, bullets, corte + 15, faixa['x1'], faixa['top'], faixa['bottom'])
    return rec


def main():
    bruto = open(PDF, 'rb').read()
    with pdfplumber.open(PDF) as pdf:
        slides = [slide(i, p) for i, p in enumerate(pdf.pages, 1)]
    doc = {
        '_comentario': 'Extração verbatim (sem correções) de [PPGP 2026] Revisão dos Escopos. Gerado por tools/ppgp-extrair.py — não editar à mão.',
        'fonte': {'nome': '[PPGP 2026] Revisão dos Escopos', 'arquivo': 'fontes/ppgp-2026/revisao-dos-escopos.pdf',
                  'sha256': hashlib.sha256(bruto).hexdigest(), 'paginas': len(slides), 'extraidoEm': date.today().isoformat(),
                  'colunas': {'estudar': 'O que estudar', 'escopo': 'Escopo', 'cases': 'Cases/Cronogramas', 'entregaveis': 'Entregáveis',
                              'saber': 'O que saber', 'riscos': 'Pontos de risco'}},
        'escopos': slides,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    for s in slides:
        print(f"{s['pagina']:>2} {s['titulo']:<48} " + ' '.join(f"{k}={len(s[k])}" for k in COLUNAS + ['saber', 'riscos']))


if __name__ == '__main__':
    sys.exit(main())
