#!/usr/bin/env python3
"""
anki-questoes.py — gera src/data/questoes.json a partir do baralho Anki do PSGP.

    python3 tools/anki-questoes.py <ANKI PSGP.colpkg | pasta extraída> [--saida src/data/questoes.json] [--baralho PSGP]

A entrada pode ser o próprio .colpkg (ou o .colpkg.zip do WhatsApp) ou a pasta com o que tem dentro dele:
collection.anki21b (ou collection.anki21 / .anki2), o arquivo `media` e as figuras numeradas (0, 1, 2…).

O que ele faz:
  - lê as notas do baralho raiz (padrão "PSGP"); o 1º subnível vira a área e o 2º o tema;
  - tira o HTML das perguntas e respostas: listas viram "•"/"1." (sublistas recuadas com espaço que o navegador
    não junta), tabelas de uma coluna viram uma etapa por linha, sem linhas vazias sobrando;
  - converte as figuras para WebP de até 1000 px (precisa do ffmpeg; sem ele, embute o arquivo original);
  - mantém o id de cada pergunta (q + fim do id da nota no Anki), então o progresso salvo no navegador continua valendo.

Precisa do pacote zstandard para o formato novo do Anki (pip install zstandard). Depois: node tools/pack.mjs && node tools/verify.mjs
"""
import argparse, base64, json, os, re, shutil, sqlite3, subprocess, sys, tempfile, unicodedata, zipfile
from datetime import date
from html.parser import HTMLParser

ORDEM_AREAS = ['revisao-geral', 'gestao-estrategica', 'gestao-de-projetos', 'gestao-financeira', 'gestao-da-producao', 'escopos', 'quiz-de-leal']
RECUO = '\x01'  # vira espaço não separável no fim (o CSS white-space:pre-line não junta)


def zstd(dados):
    if dados[:4] != b'\x28\xb5\x2f\xfd':
        return dados
    import zstandard
    return zstandard.ZstdDecompressor().stream_reader(dados).read()


def abrir_entrada(caminho, tmp):
    """Devolve a pasta com collection.* e media; extrai o .colpkg (zip) se preciso, inclusive zip dentro de zip."""
    if os.path.isdir(caminho):
        return caminho
    destino = os.path.join(tmp, 'pkg')
    with zipfile.ZipFile(caminho) as z:
        z.extractall(destino)
    internos = [f for f in os.listdir(destino) if f.endswith(('.colpkg', '.apkg', '.zip'))]
    if not any(f.startswith('collection.') for f in os.listdir(destino)) and internos:
        return abrir_entrada(os.path.join(destino, internos[0]), os.path.join(tmp, 'pkg2'))
    return destino


def nomes_media(pasta):
    """Mapa número → nome do arquivo. Formato novo: protobuf comprimido; antigo: JSON {"0": "nome.png"}."""
    bruto = zstd(open(os.path.join(pasta, 'media'), 'rb').read())
    if bruto.lstrip()[:1] == b'{':
        return {int(k): v for k, v in json.loads(bruto).items()}
    nomes, i = [], 0
    while i < len(bruto):  # repeated MediaEntry { string name = 1; uint32 size = 2; bytes sha1 = 3; … }
        if bruto[i] != 0x0A:
            break
        tam, i = ler_varint(bruto, i + 1)
        entrada, i = bruto[i:i + tam], i + tam
        j = 0
        while j < len(entrada):
            chave, j = ler_varint(entrada, j)
            campo, tipo = chave >> 3, chave & 7
            if tipo == 2:
                t, j = ler_varint(entrada, j)
                if campo == 1:
                    nomes.append(entrada[j:j + t].decode('utf8'))
                j += t
            elif tipo == 0:
                _, j = ler_varint(entrada, j)
            else:
                break
    return dict(enumerate(nomes))


def ler_varint(b, i):
    v = s = 0
    while True:
        x = b[i]; i += 1
        v |= (x & 0x7F) << s; s += 7
        if not x & 0x80:
            return v, i


class Texto(HTMLParser):
    BLOCOS = ('div', 'p', 'h1', 'h2', 'h3', 'h4', 'tr', 'table', 'blockquote')

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.listas, self.imgs, self.tabela, self.pausa = [], [], [], 0, False

    def linha_vazia(self):
        return not self.out or ''.join(self.out).rsplit('\n', 1)[-1].strip(' ' + RECUO) == ''

    def nl(self):
        if self.out and not self.out[-1].endswith('\n'):
            self.out.append('\n')

    def respiro(self):
        """Linha em branco antes de lista ou título (como a margem que o Anki mostra), se já houver texto antes."""
        texto = ''.join(self.out)
        if texto.strip(' \n' + RECUO) and not texto.endswith('\n\n'):
            self.nl(); self.out.append('\n')
        self.pausa = False

    def handle_starttag(self, t, a):
        a = dict(a)
        if t == 'br':
            if not (self.tabela and self.linha_vazia()):
                self.out.append('\n')
        elif t in self.BLOCOS or t == 'td':
            if t == 'table':
                self.tabela += 1  # tabela não ganha respiro: no Anki ela não tem margem (aqui são listas de etapas)
            if t in ('h1', 'h2', 'h3', 'h4'):
                self.respiro()
            self.nl()
        elif t in ('ol', 'ul'):
            if self.listas:
                self.nl()
            else:
                self.respiro()
            self.listas.append([t, 0])
        elif t == 'li':
            self.nl()
            nivel = len(self.listas)
            if self.listas and self.listas[-1][0] == 'ol':
                self.listas[-1][1] += 1; marca = f'{self.listas[-1][1]}. '
            else:
                marca = '• ' if nivel <= 1 else '◦ '
            self.out.append(RECUO * 4 * max(0, nivel - 1) + marca)
        elif t == 'img' and a.get('src'):
            self.imgs.append(a['src'])

    def handle_endtag(self, t):
        if t in ('ol', 'ul'):
            if self.listas:
                self.listas.pop()
            self.pausa = self.pausa or not self.listas
            self.nl()
        elif t in self.BLOCOS or t in ('li', 'td'):
            if t == 'table':
                self.tabela = max(0, self.tabela - 1)
            self.nl()

    def handle_data(self, d):
        d = d.replace('\n', ' ')
        if not d.strip() and (not self.out or self.out[-1].endswith(('\n', ' ')) or self.linha_vazia()):
            return
        if self.pausa and d.strip():
            self.respiro()  # texto depois de uma lista ou tabela: separa com uma linha em branco
        self.out.append(d)


def converter(fragmento):
    p = Texto(); p.feed(fragmento); p.close()
    t = ''.join(p.out).replace('\xa0', ' ')  # o parser já converte &nbsp; &amp; etc.
    linhas = [re.sub(r'[ \t]+', ' ', l).strip().replace(RECUO, ' ') for l in t.split('\n')]
    t = re.sub(r'\n{3,}', '\n\n', '\n'.join(linhas)).strip()
    return t, p.imgs


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def figura_webp(origem, tmp):
    if not shutil.which('ffmpeg'):
        return None
    destino = os.path.join(tmp, os.path.basename(origem) + '.webp')
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', origem, '-vf', "scale='min(1000,iw)':-2", '-c:v', 'libwebp', '-quality', '80', destino])
    return destino if r.returncode == 0 and os.path.exists(destino) else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('entrada')
    ap.add_argument('--saida', default=os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'questoes.json'))
    ap.add_argument('--baralho', default='PSGP')
    ap.add_argument('--data', default=date.today().isoformat(), help='data de atualização gravada no JSON (AAAA-MM-DD)')
    args = ap.parse_args()
    tmp = tempfile.mkdtemp(prefix='anki-')
    try:
        pasta = abrir_entrada(args.entrada, tmp)
        col = next((os.path.join(pasta, n) for n in ('collection.anki21b', 'collection.anki21', 'collection.anki2') if os.path.exists(os.path.join(pasta, n))), None)
        if not col:
            sys.exit('não achei collection.anki21b / .anki21 / .anki2 na entrada')
        banco = os.path.join(tmp, 'col.db'); open(banco, 'wb').write(zstd(open(col, 'rb').read()))
        db = sqlite3.connect(banco)
        try:
            decks = dict(db.execute('select id, name from decks').fetchall()); sep = '\x1f'
        except sqlite3.OperationalError:  # formato antigo: baralhos em JSON na tabela col
            decks = {int(k): v['name'] for k, v in json.loads(db.execute('select decks from col').fetchone()[0]).items()}; sep = '::'
        midia = nomes_media(pasta)
        por_nome = {v: k for k, v in midia.items()}

        areas, cards, usadas = {}, [], []
        for nid, flds, did in db.execute('select n.id, n.flds, c.did from notes n join cards c on c.nid = n.id where c.ord = 0 order by c.did, n.id'):
            partes = decks.get(did, '').split(sep)
            if partes[0] != args.baralho or len(partes) < 2:
                continue
            area, tema = partes[1], (partes[2] if len(partes) > 2 else '')
            campos = flds.split('\x1f')
            pergunta, i1 = converter(campos[0]); resposta, i2 = converter(campos[1] if len(campos) > 1 else '')
            if not pergunta:
                continue
            aid = slug(area); a = areas.setdefault(aid, {'id': aid, 'nome': area, 'temas': {}})
            tid = slug(tema) if tema else ''
            if tema:
                a['temas'].setdefault(tid, {'id': tid, 'nome': tema})
            imgs = [n for n in i1 + i2 if n in por_nome]
            usadas += [n for n in imgs if n not in usadas]
            cards.append({'id': 'q' + str(nid)[-9:], 'area': aid, 'tema': tid, 'pergunta': pergunta, 'resposta': resposta, **({'imagens': imgs} if imgs else {})})

        imagens = {}
        for nome in usadas:
            origem = os.path.join(pasta, str(por_nome[nome]))
            bruto = os.path.join(tmp, 'm' + str(por_nome[nome])); open(bruto, 'wb').write(zstd(open(origem, 'rb').read()))
            webp = figura_webp(bruto, tmp)
            if webp:
                imagens[nome] = 'data:image/webp;base64,' + base64.b64encode(open(webp, 'rb').read()).decode()
            else:
                cab = open(bruto, 'rb').read(4); mime = 'image/png' if cab.startswith(b'\x89PNG') else 'image/jpeg'
                imagens[nome] = f'data:{mime};base64,' + base64.b64encode(open(bruto, 'rb').read()).decode()

        lista = sorted(areas.values(), key=lambda a: ORDEM_AREAS.index(a['id']) if a['id'] in ORDEM_AREAS else 99)
        saida = {'titulo': 'Banco de questões do PSGP',
                 'fonte': f'Baralho Anki "{args.baralho}" usado na preparação para o Processo Seletivo de Gerentes de Projetos',
                 'atualizado': args.data,
                 'areas': [{'id': a['id'], 'nome': a['nome'], 'temas': sorted(a['temas'].values(), key=lambda t: t['nome'])} for a in lista],
                 'cards': cards, 'imagens': imagens}
        with open(args.saida, 'w', encoding='utf8') as f:
            json.dump(saida, f, ensure_ascii=False, indent=1); f.write('\n')
        print(f'{os.path.relpath(args.saida)}  {len(cards)} perguntas, {len(lista)} áreas, '
              f'{sum(len(a["temas"]) for a in lista)} temas, {len(imagens)} figuras')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
