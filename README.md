# Mineral Analysis Platform

> **Hyperspectral Mineral Identification, Classification and Abundance Mapping**

A dedicated geospatial research and exploration platform for surface mineralogy using imaging spectroscopy (NASA EMIT) and USGS reference spectral libraries.

---

## Overview

The **Mineral Analysis Platform** specializes hyperspectral spatial big data into actionable mineral classification maps and fractional abundance rasters:

- **Dominant Mineral Classification**: Identifies dominant surface mineral species using Spectral Angle Mapper (SAM) against the USGS Spectral Library.
- **Fractional Abundance Mapping**: Quantifies endmember proportions using Fully Constrained Least Squares (SMA / NNLS unmixing).
- **Spectroscopic Confidence & Quality**: Computes pixel-level classification probabilities, spectral angle separations, and SMA reconstruction quality.
- **USGS Reference Validation**: Validates predictions against classical spectroscopic algorithms.
- **Interactive Geospatial Visualization**: Interactive Leaflet-based map with NASA EMIT coverage outlines, single-mineral highlight rendering directly from Cloud-Optimized GeoTIFFs (COGs), point spectrum inspector, and GeoTIFF downloads for GIS workflows (QGIS, ArcGIS, GDAL).

---

## Minerals Identified

The platform targets 12 primary mineral endmembers and diagnostic absorption features across visible-to-shortwave infrared (VNIR/SWIR, 400–2500 nm):

1. **Alunite** (Sulfate)
2. **Calcite** (Carbonate)
3. **Chlorite** (Mg-OH)
4. **Dolomite** (Carbonate)
5. **Goethite** (Fe3+)
6. **Gypsum** (Sulfate)
7. **Hematite** (Fe3+)
8. **Illite** (Al-OH)
9. **Kaolinite** (Al-OH)
10. **Montmorillonite** (Al-OH)
11. **Muscovite** (Al-OH)
12. **Quartz** (Silicate)

---

## Architecture & Specialized Structure

```
Mineral-Analysis/
├── remote_sensing_pipeline-production/
│   ├── api_gateway/        # Go Gin HTTP API, authentication, job orchestration
│   ├── frontend/           # Specialized React 19 + Vite Mineral Analysis Studio
│   │   ├── src/
│   │   │   ├── components/ # AreaMap, JobForm, JobTimeline, ResultsPanel, PixelInspector
│   │   │   ├── pages/      # Workspace (Studio), History (Jobs), System (Platform Status)
│   │   │   └── lib/        # Mineral layers, COG readers, geometry utilities
│   ├── libs/
│   │   ├── hydra/          # Mineral feature extraction (530 features), SAM + SMA teacher
│   │   └── hs_common/      # GeoTIFF encoding, S3 storage, spatial helpers
│   ├── ml_inference/       # ONNX runtime inference, COG & PNG generation
│   ├── preprocessing/      # EMIT L2A radiometric calibration and bad band interpolation
│   └── tests/              # E2E, responsive UI, parity, and security tests
├── MINERAL_DASHBOARD_SPECIALIZATION_REPORT.md
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.x
- Go >= 1.22
- Python >= 3.10
- Docker & Docker Compose (for complete local stack)

### Running the Frontend

```bash
cd remote_sensing_pipeline-production/frontend
npm install
npm run dev
```

Run tests and verification:

```bash
npm test
npm run lint
npm run build
```

---

## License

This project belongs to [ananthans-Techie/Mineral-Analysis](https://github.com/ananthans-Techie/Mineral-Analysis).
