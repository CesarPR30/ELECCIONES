# -*- coding: utf-8 -*-
"""Procesa los datos del scraper ONPE (oscarzamora) y genera los JSON para la web.
Une resultados por provincia y departamento con el GeoJSON de Peru (juaneladio)."""
import json, csv, unicodedata, os

BASE = os.path.dirname(os.path.abspath(__file__))
ONPE = os.path.join(BASE, "onpe-data")
OUT = os.path.join(BASE, "site", "data")
os.makedirs(OUT, exist_ok=True)

FP, JP = "8", "10"          # Fuerza Popular (Keiko) / Juntos por el Peru (Roberto)
FP_int, JP_int = 8, 10
NULOS, BLANCO = "81", "80"

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper().strip()
    return " ".join(s.split())

# alias para corregir typos/variantes entre ONPE y el GeoJSON
PROV_ALIAS = {
    "RAYMONDI": "RAIMONDI", "NAZCA": "NASCA", "FAFARDO": "FAJARDO", "PUIRA": "PIURA",
}
def pkey(dep, prov):
    p = norm(prov)
    p = PROV_ALIAS.get(p, p)
    return (norm(dep), p)

def read_tsv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))

# ---- nombres de ubigeo (departamento / provincia) ----
prov_name = {}   # DDPP -> (dep, prov)
dep_name = {}    # DD -> dep
for row in read_tsv(os.path.join(ONPE, "output", "ubicaciones.txt")):
    if row["ambito"] != "peru":
        continue
    u = row["ubigeo"]
    dep_name[u[:2]] = row["departamento"]
    prov_name[u[:4]] = (row["departamento"], row["provincia"])

# ---- participacion / electores por provincia y departamento (mesas_data) ----
prov_elec = {}   # DDPP -> [electores, emitidos]
dep_elec = {}
for row in read_tsv(os.path.join(ONPE, "output", "mesas_data.txt")):
    u = row["id_ubigeo"]
    try:
        eh = int(row["electores_habiles"] or 0); ve = int(row["votos_emitidos"] or 0)
    except ValueError:
        continue
    a = prov_elec.setdefault(u[:4], [0, 0]); a[0] += eh; a[1] += ve
    b = dep_elec.setdefault(u[:2], [0, 0]); b[0] += eh; b[1] += ve

def build_level(resumen_file, name_lookup, elec_lookup, keylen):
    """Agrupa el resumen por ubigeo y devuelve dict code -> metrics."""
    rows = {}
    for r in read_tsv(resumen_file):
        u = r["ubigeo"][:keylen]
        d = rows.setdefault(u, {})
        d[r["partido_id"]] = r
    res = {}
    for u, parties in rows.items():
        if FP not in parties or JP not in parties:
            continue
        fp = float(parties[FP]["pct_votos_validos"]); jp = float(parties[JP]["pct_votos_validos"])
        vfp = int(parties[FP]["votos_validos"]); vjp = int(parties[JP]["votos_validos"])
        tot_val = int(parties[FP]["total_votos_validos_geo"])
        tot_emi = int(parties[FP]["total_votos_emitidos_geo"])
        nul = int(parties[NULOS]["votos_validos"]) if NULOS in parties else 0
        win = FP if fp >= jp else JP
        elec = elec_lookup.get(u, [0, 0])
        part = round(elec[1] / elec[0] * 100, 2) if elec[0] else None
        res[u] = {
            "pct_fp": round(fp, 2), "pct_jp": round(jp, 2),
            "votos_fp": vfp, "votos_jp": vjp,
            "votos_validos": tot_val, "votos_emitidos": tot_emi,
            "pct_nulos": round(nul / tot_emi * 100, 2) if tot_emi else 0,
            "winner": int(win), "margin": round(abs(fp - jp), 2),
            "electores": elec[0], "participacion": part,
        }
    return res

prov_res = build_level(os.path.join(ONPE, "resumen", "resumen_provincias.txt"), prov_name, prov_elec, 4)
dep_res  = build_level(os.path.join(ONPE, "resumen", "resumen_departamentos.txt"), dep_name, dep_elec, 2)

# ---- actas: total vs pendientes por provincia / departamento ----
prov_actas, dep_actas = {}, {}          # code -> [total, pendientes]
mesa2ubigeo = {}
nac_actas_pend = 0
for row in read_tsv(os.path.join(ONPE, "output", "mesas_data.txt")):
    u = row["id_ubigeo"]; mesa2ubigeo[row["codigo_mesa"]] = u
    pend = 0 if row["codigo_estado_acta"] == "C" else 1
    nac_actas_pend += pend
    a = prov_actas.setdefault(u[:4], [0, 0]); a[0] += 1; a[1] += pend
    b = dep_actas.setdefault(u[:2], [0, 0]); b[0] += 1; b[1] += pend
for code, r in prov_res.items():
    t = prov_actas.get(code, [0, 0]); r["actas_total"] = t[0]; r["actas_pend"] = t[1]
for code, r in dep_res.items():
    t = dep_actas.get(code, [0, 0]); r["actas_total"] = t[0]; r["actas_pend"] = t[1]

# ---- join provincias con geojson (por nombre dep+prov) ----
def attach(geojson_path, name_keyfn, results_by_code, code_index, label_fields, out_path):
    geo = json.load(open(geojson_path, encoding="utf-8"))
    matched = 0
    feats = []
    for f in geo["features"]:
        key = name_keyfn(f["properties"])
        code = code_index.get(key)
        r = results_by_code.get(code) if code else None
        if not r:
            continue
        props = {k: f["properties"][k] for k in label_fields}
        props.update(r)
        props["code"] = code
        f["properties"] = props
        feats.append(f); matched += 1
    geo["features"] = feats
    json.dump(geo, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    return matched, len(results_by_code)

# index: name-key -> code
prov_idx = {pkey(*v): k for k, v in prov_name.items()}
dep_idx = {norm(v): k for k, v in dep_name.items()}

m, t = attach(
    os.path.join(OUT, "peru_provincial.geojson"),
    lambda p: pkey(p["FIRST_NOMB"], p["NOMBPROV"]),
    prov_res, prov_idx, ["NOMBPROV", "FIRST_NOMB"],
    os.path.join(OUT, "provincias.geojson"),
)
# renombrar campos legibles en provincias
g = json.load(open(os.path.join(OUT, "provincias.geojson"), encoding="utf-8"))
for f in g["features"]:
    f["properties"]["prov"] = f["properties"].pop("NOMBPROV")
    f["properties"]["dep"] = f["properties"].pop("FIRST_NOMB")
json.dump(g, open(os.path.join(OUT, "provincias.geojson"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"provincias: {m}/{t} unidas")

md, td = attach(
    os.path.join(OUT, "peru_departamentos.geojson"),
    lambda p: norm(p["NOMBDEP"]),
    dep_res, dep_idx, ["NOMBDEP"],
    os.path.join(OUT, "departamentos.geojson"),
)
g = json.load(open(os.path.join(OUT, "departamentos.geojson"), encoding="utf-8"))
for f in g["features"]:
    f["properties"]["dep"] = f["properties"].pop("NOMBDEP")
json.dump(g, open(os.path.join(OUT, "departamentos.geojson"), "w", encoding="utf-8"), ensure_ascii=False)
print(f"departamentos: {md}/{td} unidas")

# ---- distritos de Lima (provincia ONPE 1401: LIMA / LIMA) ----
LIMA_PROV = "1401"
dist_name = {}                       # ubigeo6 -> distrito
for row in read_tsv(os.path.join(ONPE, "output", "ubicaciones.txt")):
    if row["ambito"] == "peru" and row["ubigeo"][:4] == LIMA_PROV:
        dist_name[row["ubigeo"]] = row["distrito"]

dist_elec, dist_actas = {}, {}       # ubigeo6 -> [..]
for row in read_tsv(os.path.join(ONPE, "output", "mesas_data.txt")):
    u = row["id_ubigeo"]
    if u[:4] != LIMA_PROV:
        continue
    try:
        eh = int(row["electores_habiles"] or 0); ve = int(row["votos_emitidos"] or 0)
    except ValueError:
        eh = ve = 0
    a = dist_elec.setdefault(u, [0, 0]); a[0] += eh; a[1] += ve
    pend = 0 if row["codigo_estado_acta"] == "C" else 1
    b = dist_actas.setdefault(u, [0, 0]); b[0] += 1; b[1] += pend

dist_votes = {}                      # ubigeo6 -> {"fp":, "jp":}
for row in read_tsv(os.path.join(ONPE, "output", "votos.txt")):
    u = mesa2ubigeo.get(row["codigo_mesa"])
    if not u or u[:4] != LIMA_PROV:
        continue
    pid = row["partido_id"]
    key = "fp" if pid == FP else "jp" if pid == JP else None
    if not key:
        continue
    dist_votes.setdefault(u, {"fp": 0, "jp": 0})[key] += int(row["votos"] or 0)

dist_res = {}
for u, v in dist_votes.items():
    tot = v["fp"] + v["jp"]
    if not tot:
        continue
    fp = v["fp"] / tot * 100; jp = v["jp"] / tot * 100
    elec = dist_elec.get(u, [0, 0]); act = dist_actas.get(u, [0, 0])
    dist_res[u] = {
        "pct_fp": round(fp, 2), "pct_jp": round(jp, 2),
        "votos_fp": v["fp"], "votos_jp": v["jp"], "votos_validos": tot,
        "votos_emitidos": elec[1], "electores": elec[0],
        "winner": FP_int if v["fp"] >= v["jp"] else JP_int,
        "margin": round(abs(fp - jp), 2),
        "participacion": round(elec[1] / elec[0] * 100, 2) if elec[0] else None,
        "actas_total": act[0], "actas_pend": act[1],
    }

dist_idx = {norm(name): u for u, name in dist_name.items()}
DIST_ALIAS = {"MAGDALENA VIEJA": "PUEBLO LIBRE"}
def dkey(props):
    if norm(props["NOMBDEP"]) != "LIMA" or norm(props["NOMBPROV"]) != "LIMA":
        return None
    d = norm(props["NOMBDIST"]); d = DIST_ALIAS.get(d, d)
    return d
geo = json.load(open(os.path.join(OUT, "peru_distrital_full.geojson"), encoding="utf-8"))
feats, matched = [], 0
for f in geo["features"]:
    k = dkey(f["properties"])
    if not k:
        continue
    code = dist_idx.get(k); r = dist_res.get(code) if code else None
    if not r:
        continue
    props = {"dist": f["properties"]["NOMBDIST"], "code": code}
    props.update(r)
    f["properties"] = props
    feats.append(f); matched += 1
geo["features"] = feats
json.dump(geo, open(os.path.join(OUT, "lima_distritos.geojson"), "w", encoding="utf-8"), ensure_ascii=False)
lima_fp = sum(d["votos_fp"] for d in dist_res.values())
lima_jp = sum(d["votos_jp"] for d in dist_res.values())
lima_tot = lima_fp + lima_jp
print(f"lima distritos: {matched}/{len(dist_res)} unidos | "
      f"Keiko {round(lima_fp/lima_tot*100,2)} vs Roberto {round(lima_jp/lima_tot*100,2)}")

# ---- voto en el extranjero (por país y continente) ----
ext_pais, ext_cont = {}, {}   # nombre -> dict
code2info = {}                # ubigeo6 -> (pais, continente)
for row in read_tsv(os.path.join(ONPE, "output", "ubicaciones.txt")):
    if row["ambito"] == "exterior":
        code2info[row["ubigeo"]] = (row["pais"] or row["ciudad"], row["continente"])
# emitidos por país (mesas_data exterior)
for row in read_tsv(os.path.join(ONPE, "output", "mesas_data.txt")):
    u = row["id_ubigeo"]
    if u not in code2info:
        continue
    pais, cont = code2info[u]
    try:
        ve = int(row["votos_emitidos"] or 0); eh = int(row["electores_habiles"] or 0)
    except ValueError:
        ve = eh = 0
    p = ext_pais.setdefault(pais, {"pais": pais, "continente": cont, "fp": 0, "jp": 0, "emitidos": 0, "electores": 0})
    p["emitidos"] += ve; p["electores"] += eh
    c = ext_cont.setdefault(cont, {"continente": cont, "fp": 0, "jp": 0, "emitidos": 0})
    c["emitidos"] += ve
# votos por país (votos.txt -> mesa -> ubigeo)
for row in read_tsv(os.path.join(ONPE, "output", "votos.txt")):
    u = mesa2ubigeo.get(row["codigo_mesa"])
    if not u or u not in code2info:
        continue
    pais, cont = code2info[u]
    v = int(row["votos"] or 0); pid = row["partido_id"]
    key = "fp" if pid == FP else "jp" if pid == JP else None
    if not key:
        continue
    ext_pais[pais][key] += v
    ext_cont[cont][key] += v
# nombre ONPE (normalizado) -> código ISO3 del GeoJSON mundial
ISO3 = {
    "ESTADOS UNIDOS DE AMERICA": "USA", "ESPANA": "ESP", "CHILE": "CHL", "ARGENTINA": "ARG",
    "ITALIA": "ITA", "JAPON": "JPN", "CANADA": "CAN", "BRASIL": "BRA", "BOLIVIA": "BOL",
    "FRANCIA": "FRA", "ALEMANIA": "DEU", "ECUADOR": "ECU", "SUIZA": "CHE", "COLOMBIA": "COL",
    "AUSTRALIA": "AUS", "BELGICA": "BEL", "MEXICO": "MEX", "GRAN BRETANA": "GBR", "PANAMA": "PAN",
    "COSTA RICA": "CRI", "SUECIA": "SWE", "URUGUAY": "URY", "HOLANDA": "NLD", "PARAGUAY": "PRY",
    "REPUBLICA DOMINICANA": "DOM", "AUSTRIA": "AUT", "GUAYANA FRANCESA": "GUF", "NUEVA ZELANDA": "NZL",
    "PUERTO RICO": "PRI", "GUATEMALA": "GTM", "ISRAEL": "ISR", "DINAMARCA": "DNK", "PORTUGAL": "PRT",
    "GRAN DUCADO DE LUXEMBURGO": "LUX", "REPUBLICA POPULAR CHINA": "CHN", "RUSIA": "RUS",
    "NORUEGA": "NOR", "REPUBLICA DE COREA": "KOR", "HUNGRIA": "HUN", "PRINCIPADO DE ANDORRA": "AND",
    "FINLANDIA": "FIN", "EMIRATOS ARABES UNIDOS": "ARE", "POLONIA": "POL", "REPUBLICA CHECA": "CZE",
    "EL SALVADOR": "SLV", "IRLANDA": "IRL", "NICARAGUA": "NIC", "HONDURAS": "HND", "RUMANIA": "ROU",
    "GRECIA": "GRC", "JORDANIA": "JOR", "SINGAPUR": "SGP", "TURQUIA": "TUR", "SUDAFRICA": "ZAF",
    "TAILANDIA": "THA", "MALTA": "MLT", "CUBA": "CUB", "CATAR": "QAT", "ARABIA SAUDITA": "SAU",
    "BIELORRUSIA": "BLR", "REPUBLICA ARABE DE EGIPTO": "EGY", "INDIA": "IND", "INDONESIA": "IDN",
    "MARRUECOS": "MAR", "TRINIDAD Y TOBAGO": "TTO", "ARGELIA": "DZA", "MALASIA": "MYS",
    "FILIPINAS": "PHL", "VIETNAM": "VNM", "MACEDONIA": "MKD", "KUWAIT": "KWT", "KENIA": "KEN",
}
for d in list(ext_pais.values()) + list(ext_cont.values()):
    d["winner"] = FP_int if d["fp"] >= d["jp"] else JP_int
    tot = d["fp"] + d["jp"]
    d["pct_fp"] = round(d["fp"] / tot * 100, 2) if tot else 0
    d["pct_jp"] = round(d["jp"] / tot * 100, 2) if tot else 0
for d in ext_pais.values():
    d["iso3"] = ISO3.get(norm(d["pais"]))
paises = sorted(ext_pais.values(), key=lambda x: x["fp"] + x["jp"], reverse=True)
continentes = sorted(ext_cont.values(), key=lambda x: x["fp"] + x["jp"], reverse=True)
ext_fp = sum(p["fp"] for p in paises); ext_jp = sum(p["jp"] for p in paises)
extranjero = {
    "fp_total": ext_fp, "jp_total": ext_jp,
    "pct_fp": round(ext_fp / (ext_fp + ext_jp) * 100, 2) if (ext_fp + ext_jp) else 0,
    "pct_jp": round(ext_jp / (ext_fp + ext_jp) * 100, 2) if (ext_fp + ext_jp) else 0,
    "winner": FP_int if ext_fp >= ext_jp else JP_int,
    "continentes": continentes,
    "paises": [p for p in paises if (p["fp"] + p["jp"]) >= 1],
}
json.dump(extranjero, open(os.path.join(OUT, "extranjero.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
unmapped = [p["pais"] for p in extranjero["paises"] if not p.get("iso3")]
print(f"extranjero: {len(paises)} países, ganador {'Keiko' if extranjero['winner']==FP_int else 'Roberto'} {extranjero['pct_fp']} vs {extranjero['pct_jp']}")
if unmapped:
    print("  [!] paises sin ISO3 (no saldran en el mapa):", ", ".join(unmapped))

# ---- nacional + ranking de departamentos para charts ----
nac = read_tsv(os.path.join(ONPE, "resumen", "resumen_nacional.txt"))
def find(rows, frag):
    for r in rows:
        if frag in r["nombre_agrupacion_politica"]:
            return r
    return {}
fp_n = find(nac, "FUERZA"); jp_n = find(nac, "JUNTOS")
nul_n = find(nac, "NULOS"); bl_n = find(nac, "BLANCO")

dep_list = []
for code, r in dep_res.items():
    if code[:1] == "9":            # excluye continentes del exterior
        continue
    rr = dict(r); rr["code"] = code; rr["dep"] = dep_name.get(code[:2], code)
    dep_list.append(rr)
dep_list.sort(key=lambda x: x["pct_fp"], reverse=True)

national = {
    "fp": {"candidato": fp_n.get("nombre_candidato", "KEIKO FUJIMORI"),
           "partido": "FUERZA POPULAR",
           "votos": int(fp_n.get("votos_validos", 0)),
           "pct": float(fp_n.get("pct_votos_validos", 0))},
    "jp": {"candidato": jp_n.get("nombre_candidato", "ROBERTO SANCHEZ"),
           "partido": "JUNTOS POR EL PERU",
           "votos": int(jp_n.get("votos_validos", 0)),
           "pct": float(jp_n.get("pct_votos_validos", 0))},
    "nulos": int(nul_n.get("votos_validos", 0)),
    "blancos": int(bl_n.get("votos_validos", 0)),
    "actas_pct": float(fp_n.get("actas_contabilizadas_pct", 0)),
    "contabilizadas": int(fp_n.get("contabilizadas", 0)),
    "total_actas": int(fp_n.get("total_actas", 0)),
    "actas_pend": nac_actas_pend,
    "participacion": float(fp_n.get("participacion_ciudadana", 0)),
    "fecha": fp_n.get("fecha_actualizacion", ""),
    "departamentos": dep_list,
}
json.dump(national, open(os.path.join(OUT, "national.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("national.json listo. Ganador nacional:",
      "Keiko" if national["fp"]["pct"] >= national["jp"]["pct"] else "Roberto",
      national["fp"]["pct"], "vs", national["jp"]["pct"])
