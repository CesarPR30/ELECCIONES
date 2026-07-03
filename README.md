# Elecciones Perú 2026 — Segunda Vuelta

Visualización interactiva con *scrollytelling* de los resultados oficiales (ONPE) de la
segunda vuelta presidencial: **Roberto Sánchez** vs **Keiko Fujimori**, provincia por
provincia, distritos de Lima y voto en el extranjero.

**Sitio en vivo:** https://cesarpr30.github.io/ELECCIONES/

## Estructura

```
index.html     Página principal (scrollytelling)
main.js        Lógica de mapas y burbujas (d3 + scrollama)
styles.css
data/          GeoJSON + JSON de resultados que consume el sitio
```

Sitio estático servido directamente por **GitHub Pages** desde la rama `main` (raíz).
El archivo `.nojekyll` desactiva el procesamiento Jekyll.

## Desarrollo local

```bash
python -m http.server 8000
# abre http://localhost:8000
```

## Créditos y fuentes

- Datos: **ONPE** — API oficial (`idEleccion 10`), extraídos con
  [oscarzamora/onpe-scraper-2026-2](https://github.com/oscarzamora/onpe-scraper-2026-2).
- Geometría: [juaneladio/peru-geojson](https://github.com/juaneladio/peru-geojson).
