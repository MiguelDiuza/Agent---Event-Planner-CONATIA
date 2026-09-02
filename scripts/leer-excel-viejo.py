# -*- coding: utf-8 -*-
#
# Lee el libro viejo del equipo (`2025.xlsx`) y deja cada pestana en un .json,
# listo para `scripts/replicar-hojas-excel-viejo.js`.
#
#   python scripts/leer-excel-viejo.py <archivo.xlsx> <directorio-de-salida>
#   python scripts/leer-excel-viejo.py <archivo.xlsx>          # solo el resumen
#
# POR QUE ESTE ES EL UNICO ARCHIVO EN PYTHON DEL REPO. Un .xlsx es un zip de
# XML, y leerlo bien pide un lector de zip y un parser de XML. Python los trae
# los dos en la biblioteca estandar; Node no trae ninguno, y este repo no tiene
# node_modules a proposito. La alternativa era escribir a mano el parser del
# directorio central del zip y sacar las celdas con expresiones regulares --
# justo donde un fallo no avisa: una celda mal leida no revienta, se copia mal.
#
# LO UNICO CON TRUCO SON LAS FECHAS. En el archivo son numeros -- dias desde el
# 30/12/1899 -- y lo que las convierte en fecha es el FORMATO de la celda, que
# vive en styles.xml. Sin mirar eso, un calendario entero sale como una columna
# de cuarenta y seis mil y pico, y nadie lo nota hasta que lo abre una persona.
#
# EL RESTO SE COPIA COMO SE VE. Los enteros como enteros ("7", no "7.0"), el
# texto tal cual, y las celdas vacias vacias -- incluidas las filas mas cortas
# que las demas, que en estos calendarios son la mayoria. Fiel gana a listo: lo
# que sale de aqui se escribe en crudo, sin que Sheets reinterprete nada.
import zipfile, re, datetime, json, sys, os
import xml.etree.ElementTree as ET

M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': M}

# Los formatos de fecha que Excel trae de fabrica (no aparecen en styles.xml).
INTEGRADOS_FECHA = set(list(range(14, 23)) + list(range(45, 48)) + [27, 30, 36, 50, 57])


def texto_celda(c, compartidas, es_fecha):
    t = c.get('t')
    v = c.find(f'{{{M}}}v')
    if t == 'inlineStr':
        istr = c.find(f'{{{M}}}is')
        return ''.join(n.text or '' for n in istr.iter(f'{{{M}}}t')) if istr is not None else ''
    if v is None or v.text is None:
        return ''
    if t == 's':
        return compartidas[int(v.text)]
    if t == 'b':
        return 'VERDADERO' if v.text == '1' else 'FALSO'
    if t == 'e':
        return v.text                      # #REF!, #N/A...
    if t in ('str', 'inlineStr'):
        return v.text
    # numero
    if es_fecha:
        try:
            n = float(v.text)
            base = datetime.datetime(1899, 12, 30)
            d = base + datetime.timedelta(days=n)
            if abs(n - int(n)) < 1e-9:
                return d.strftime('%Y-%m-%d')
            return d.strftime('%Y-%m-%d %H:%M')
        except Exception:
            return v.text
    # Entero como entero: "7.0" en una celda que dice 7 seria un cambio.
    try:
        f = float(v.text)
        return str(int(f)) if abs(f - int(f)) < 1e-12 else repr(f).rstrip('0').rstrip('.')
    except Exception:
        return v.text


def columna_a_indice(ref):
    letras = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for ch in letras:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def leer(ruta):
    z = zipfile.ZipFile(ruta)

    compartidas = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in ss.findall(f'{{{M}}}si'):
            compartidas.append(''.join(n.text or '' for n in si.iter(f'{{{M}}}t')))

    # Que estilos son de fecha
    estilos_fecha = {}
    if 'xl/styles.xml' in z.namelist():
        st = ET.fromstring(z.read('xl/styles.xml'))
        propios = {}
        nfmts = st.find(f'{{{M}}}numFmts')
        if nfmts is not None:
            for nf in nfmts:
                propios[int(nf.get('numFmtId'))] = nf.get('formatCode')
        xfs = st.find(f'{{{M}}}cellXfs')
        if xfs is not None:
            for i, xf in enumerate(xfs):
                fid = int(xf.get('numFmtId', 0))
                if fid in INTEGRADOS_FECHA:
                    estilos_fecha[i] = True
                elif fid in propios:
                    cod = re.sub(r'\[[^\]]*\]|"[^"]*"', '', propios[fid])
                    estilos_fecha[i] = bool(re.search(r'[dmyhsDMYHS]', cod)) and 'General' not in cod
                else:
                    estilos_fecha[i] = False

    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}

    hojas = []
    for s in wb.find(f'{{{M}}}sheets'):
        destino = rels[s.get(f'{{{R}}}id')]
        if not destino.startswith('/'):
            destino = 'xl/' + destino.lstrip('/')
        raiz = ET.fromstring(z.read(destino))
        filas = {}
        for fila in raiz.iter(f'{{{M}}}row'):
            n = int(fila.get('r'))
            celdas = {}
            for c in fila.findall(f'{{{M}}}c'):
                ref = c.get('r')
                if not ref:
                    continue
                idx = columna_a_indice(ref)
                sidx = int(c.get('s', 0))
                val = texto_celda(c, compartidas, estilos_fecha.get(sidx, False))
                if val != '':
                    celdas[idx] = val
            if celdas:
                filas[n] = celdas

        # A rejilla, sin filas ni columnas vacias al final
        rejilla = []
        if filas:
            ultima = max(filas)
            ancho = max(max(c) for c in filas.values()) + 1
            for i in range(1, ultima + 1):
                c = filas.get(i, {})
                rejilla.append([c.get(j, '') for j in range(ancho)])
        hojas.append({'titulo': s.get('name'),
                      'oculta': (s.get('state') or 'visible') != 'visible',
                      'filas': rejilla})
    return hojas


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__ or 'uso: python scripts/leer-excel-viejo.py <archivo.xlsx> [salida]')
        sys.exit(1)

    hojas = leer(sys.argv[1])
    salida = sys.argv[2] if len(sys.argv) > 2 else None
    if salida:
        os.makedirs(salida, exist_ok=True)

    for i, h in enumerate(hojas):
        n = len(h['filas'])
        ancho = max((len(f) for f in h['filas']), default=0)
        con = sum(1 for f in h['filas'] if any(str(x).strip() for x in f))
        print(f"{h['titulo']!r:24} {'OCULTA' if h['oculta'] else '      '} "
              f"{n:4} filas x {ancho:3} col   ({con} con contenido)")
        if not salida:
            continue
        # El numero delante conserva el ORDEN de las pestanas en el libro: el
        # script que las copia lee el directorio ordenado, y sin esto acabarian
        # alfabeticas, que no es como el equipo las tiene.
        seguro = re.sub(r'[^A-Za-z0-9 _.-]', '_', h['titulo']).strip() or f'hoja{i+1}'
        with open(os.path.join(salida, f'{i+1:02d}-{seguro}.json'), 'w', encoding='utf-8') as fh:
            json.dump(h, fh, ensure_ascii=False, indent=1)

    if salida:
        print(f'\n{len(hojas)} pestana(s) escritas en {salida}')
