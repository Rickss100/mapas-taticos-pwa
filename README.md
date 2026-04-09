# BrasilCartaPro — Mapas Táticos

PWA de visualização cartográfica tática e impressão profissional A3 com grade UTM.

## Stack
- **Mapa**: MapLibre GL JS 4.7
- **Camadas**: OSM, OpenTopoMap, Esri Satellite, Stadia Dark + WMS INDE/DSG e IBGE
- **Grade**: UTM SIRGAS 2000 (cálculo geodésico nativo)
- **Offline**: Service Worker com cache-first para tiles
- **Impressão**: CSS `@page A3 landscape` + exportação PNG 150 DPI

## Estrutura
```
mapas-taticos-pwa/
├── index.html          # Shell da PWA
├── app.js              # Lógica principal
├── style.css           # Design system (tema militar verde/grafite)
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker
└── modules/
    ├── grid.js         # Grade UTM dinâmica
    ├── compass.js      # Rosa dos ventos + declinação magnética
    ├── layers.js       # Gerenciador de camadas
    └── print.js        # Motor de impressão A3 / exportação PNG
```

## Servir localmente
```bash
npx serve .
# ou
python -m http.server 8080
```

## Fontes de dados
- OpenStreetMap © contributors (CC BY-SA)
- OpenTopoMap (CC BY-SA)
- Esri World Imagery
- Stadia Maps
- DSG/EB — Carta Topográfica Militar 1:250.000 (WMS)
- IBGE BC250 Malha Municipal (WMS)

## Licença
MIT — Ricardo Arthur, 2026
