# Elecciones Perú 2026 — Segunda Vuelta

Visualización interactiva con *scrollytelling* de los resultados oficiales (ONPE) de la
segunda vuelta presidencial: **Roberto Sánchez** vs **Keiko Fujimori**, provincia por
provincia, distritos de Lima y voto en el extranjero.

**Sitio en vivo:** https://cesarpr30.github.io/ELECCIONES/

## Estructura

```
site/                 Sitio estático publicado en GitHub Pages
  index.html          Página principal (scrollytelling)
  main.js             Lógica de mapas y burbujas (d3 + scrollama)
  styles.css
  data/               GeoJSON + JSON de resultados que consume el sitio
build_data.py         Genera los JSON de site/data a partir de onpe-data
onpe-data/            Pipeline de scraping de la API oficial de ONPE
```

## Despliegue (GitHub Pages)

El sitio se publica automáticamente con GitHub Actions en cada `push` a `main`
(ver [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)), tomando la
carpeta [`site/`](site/) como raíz.

Para activarlo la primera vez:
**Settings → Pages → Build and deployment → Source: _GitHub Actions_.**

## Desarrollo local

```bash
cd site
python -m http.server 8000
# abre http://localhost:8000
```

## Créditos y fuentes

- Datos: **ONPE** — API oficial (`idEleccion 10`), extraídos con
  [oscarzamora/onpe-scraper-2026-2](https://github.com/oscarzamora/onpe-scraper-2026-2).
- Geometría: [juaneladio/peru-geojson](https://github.com/juaneladio/peru-geojson).
