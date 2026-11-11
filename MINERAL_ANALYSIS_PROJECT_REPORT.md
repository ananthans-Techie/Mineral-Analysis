# Mineral Analysis Platform: A Distributed Hyperspectral Remote Sensing System for Surface Mineral Identification Using NASA EMIT Data

---

**Course**: Spatial Big Data  
**Project Report**  
**Public Website**: https://mineral-analysis.ananthans-ds25.workers.dev

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Methodology](#2-methodology)
3. [Results](#3-results)
4. [Discussion](#4-discussion)
5. [References](#5-references)

---

## 1. Introduction

Mineral dust aerosols released from arid and semi-arid landscapes play a significant role in shaping Earth's climate system. When fine mineral particles become airborne, they scatter and absorb solar radiation, modify cloud formation processes, and deposit essential nutrients into distant ecosystems. Despite their importance, the precise composition and spatial distribution of surface minerals that serve as dust sources remain poorly mapped at regional and global scales. Traditional field surveys are expensive, time-consuming, and inherently limited in the area they can cover. Meanwhile, conventional multispectral satellite sensors such as Landsat or Sentinel-2, which capture data in only a handful of broad wavelength bands, lack the spectral resolution needed to reliably distinguish one mineral species from another. Two minerals that look nearly identical in a five-band image can reveal entirely different absorption signatures when observed across hundreds of narrow, contiguous spectral channels.

This limitation is precisely what hyperspectral remote sensing was designed to overcome. By recording reflected sunlight across hundreds of wavelengths rather than a few, hyperspectral imaging spectrometers can detect the subtle molecular vibration and electronic transition features that uniquely fingerprint each mineral. The launch of NASA's **Earth Surface Mineral Dust Source Investigation (EMIT)** instrument aboard the International Space Station in July 2022 brought a new generation of spaceborne hyperspectral data to the scientific community. EMIT captures 285 contiguous spectral channels spanning from 381 nm in the visible range to 2493 nm deep into the shortwave infrared, with a ground sampling distance of approximately 60 meters per pixel. This combination of fine spectral resolution and moderate spatial coverage makes EMIT data exceptionally well suited for mapping surface mineralogy over large regions.

However, working with hyperspectral data at this scale introduces serious computational challenges. A single EMIT scene can contain millions of pixels, each described by a 285-element reflectance vector. Classifying every pixel against a reference mineral library, and then estimating the fractional abundance of each mineral within every pixel, requires substantial processing power and a carefully designed data pipeline. Raw satellite reflectance values must first be corrected for atmospheric absorption artifacts, smoothed to reduce sensor noise, and transformed into a higher-dimensional feature space that accentuates diagnostic mineral absorption bands. Only then can machine learning algorithms reliably distinguish kaolinite from montmorillonite, or separate hematite from goethite — minerals whose spectral differences may be confined to a narrow wavelength window just a few tens of nanometers wide.

The **Mineral Analysis Platform** presented in this report was developed to address these challenges. It is a web-based, distributed geospatial system that automates the entire workflow from raw NASA EMIT data acquisition through mineral classification and sub-pixel fractional abundance estimation. The platform is built around a microservice architecture orchestrated through Apache Kafka event streaming, with a React-based interactive frontend for visualization and a suite of Python scientific workers for heavy computational tasks. Its mineral identification engine relies on two complementary approaches: the **Spectral Angle Mapper (SAM)** algorithm for per-pixel dominant mineral classification, and **Fully Constrained Least Squares (FCLS) Linear Spectral Mixture Analysis** for sub-pixel unmixing. Both methods operate against a curated library of 12 reference mineral endmembers drawn from the **USGS Spectral Library Version 7**, covering the most geologically significant mineral species found in arid dust-source regions.

The platform has been deployed in a dual-tier architecture. A public-facing website hosted on Cloudflare's global edge network provides instant, zero-cost access to the interactive map interface, EMIT swath coverage visualization, and the full USGS endmember reference library. A private computing cluster running 16 Docker containers handles the actual scientific computation — data ingestion, preprocessing, and machine learning inference — and can be deployed either on a local workstation or a remote Linux server. This separation allows external visitors, reviewers, and collaborators to explore the platform's capabilities without requiring access to the compute infrastructure, while authorized researchers retain full control over the analysis pipeline.

---

## 2. Methodology

### 2.1 Data Source and Acquisition

All spectral data used by the platform originates from NASA's EMIT Level 2A Surface Reflectance product (EMIT_L2A_RFL). This product provides atmospherically corrected reflectance values normalized to the range [0, 1], meaning the raw radiance measured at the sensor has already been converted to the fraction of sunlight reflected by the ground surface after accounting for atmospheric scattering and gaseous absorption. The sensor captures 285 spectral bands at roughly 7.4 nm intervals, covering the visible, near-infrared, and shortwave-infrared portions of the electromagnetic spectrum. Each pixel corresponds to an area of approximately 60 × 60 meters on the ground, and each scene covers a swath approximately 75 km wide.

When a user initiates an analysis job through the web interface, they draw a bounding box on an interactive Leaflet map to define their region of interest and specify a date range. The platform's ingestion worker then queries NASA's Common Metadata Repository (CMR) API to identify all EMIT L2A granules that intersect the requested area and time window. Matching scenes are downloaded in NetCDF4 format using authenticated Earthdata bearer tokens, spatially cropped to the bounding box, and stored as compressed arrays in a MinIO S3-compatible object store. Each downloaded scene retains its original wavelength calibration vector, geolocation arrays, and quality flags.

### 2.2 Spectral Preprocessing and Feature Engineering

Raw hyperspectral reflectance data, even after atmospheric correction, contains artifacts that would interfere with mineral identification if left untreated. The preprocessing pipeline addresses these through a sequence of carefully ordered corrections.

**Bad-Band Masking.** Atmospheric water vapor completely absorbs ground-reflected light in two well-known wavelength windows: 1320–1440 nm (the 1.4 μm water band) and 1800–1970 nm (the 1.9 μm water band). In these ranges, the reflectance values recorded by the sensor carry no useful information about the surface — they represent noise from incomplete atmospheric correction. The pipeline masks these bands entirely, along with any channels that report negative reflectance (a physical impossibility indicating sensor error) or saturation values at or above 1.0. Missing or masked values are reconstructed through cubic spline interpolation from adjacent valid wavelengths to maintain a continuous spectral profile.

**Spectral Smoothing.** After masking, the remaining reflectance values still contain high-frequency noise from detector electronics, stray light, and digitization artifacts. The pipeline applies a Savitzky-Golay polynomial filter, which fits a low-degree polynomial to successive windows of spectral channels and replaces each value with the fitted estimate. This preserves the shape and position of genuine absorption features while suppressing random noise — a critical distinction, because overly aggressive smoothing could blur the very spectral details needed to tell one mineral from another.

**Continuum Removal.** Perhaps the most important preprocessing step for mineral identification is continuum removal, a technique that normalizes the overall shape of each spectrum to isolate individual absorption bands. The method works by fitting an upper convex hull (the "continuum") across the reflectance spectrum, connecting successive local maxima with straight-line segments. The reflectance at each wavelength is then divided by the continuum value at that wavelength:

$$R_c(\lambda) = \frac{R(\lambda)}{H(\lambda)}$$

where $R(\lambda)$ is the measured reflectance and $H(\lambda)$ is the convex hull value. The result is a continuum-removed spectrum in which absorption features appear as downward dips from a value of 1.0, regardless of the mineral's overall brightness or albedo. This step is essential because two samples of the same mineral can have very different absolute reflectance levels — a sunlit outcrop versus a shadowed slope, for instance — yet their continuum-removed spectra will show the same diagnostic absorption pattern.

**530-Dimensional Feature Vector.** Rather than feeding only the cleaned reflectance values into the classification algorithms, the pipeline constructs an augmented 530-dimensional feature vector for each pixel. This vector combines the 285 continuum-removed reflectance values with 120 first-derivative features (capturing the slopes of absorption band edges), 85 second-derivative features (pinpointing exact absorption minima), and 40 hand-crafted diagnostic band-depth indices targeting the specific wavelength positions where key minerals absorb. These indices include the Al-OH hydroxyl feature near 2200 nm (diagnostic of kaolinite, illite, and muscovite), the carbonate overtone near 2340 nm (diagnostic of calcite and dolomite), ferric iron absorptions near 860–920 nm (diagnostic of hematite and goethite), and sulfate hydration features near 1750 nm (diagnostic of gypsum). By combining physics-based spectral features with statistically derived derivatives, the feature vector gives the classification algorithms multiple independent lines of evidence for identifying each mineral.

### 2.3 Reference Endmember Library

The platform's mineral identification capability depends entirely on the quality of its reference spectra. We use 12 endmember mineral signatures drawn from the USGS Spectral Library Version 7 (Splib07a), which is the most widely used and rigorously validated spectral reference database in the remote sensing community. Each endmember was measured under controlled laboratory conditions on pure mineral samples, ensuring that the spectral signatures represent unambiguous ground truth. The 12 minerals were selected to represent the primary dust-source mineral groups found in arid and semi-arid environments: phyllosilicate clays (kaolinite, montmorillonite, illite, muscovite), sulfates (alunite, gypsum), carbonates (calcite, dolomite), iron oxides (hematite, goethite), ferromagnesian silicates (chlorite), and framework silicates (quartz). Together, these minerals cover the most geologically significant species identified in previous EMIT-related studies and the broader mineral dust research literature.

### 2.4 Spectral Angle Mapper (SAM) Classification

The Spectral Angle Mapper is a physically motivated classification algorithm that measures the similarity between an unknown pixel spectrum and each reference endmember by computing the angle between them when both are treated as vectors in high-dimensional spectral space. For an unknown pixel spectrum $\vec{x}$ and a reference endmember $\vec{r}_k$, the spectral angle is:

$$\theta(\vec{x}, \vec{r}_k) = \arccos \left( \frac{\sum_{i=1}^{B} x_i \, r_{k,i}}{\sqrt{\sum_{i=1}^{B} x_i^2} \; \sqrt{\sum_{i=1}^{B} r_{k,i}^2}} \right)$$

where $B$ is the number of spectral bands. The pixel is assigned to the mineral class with the smallest spectral angle, provided that angle falls below a threshold of 0.10 radians (approximately 5.73°). Pixels whose minimum angle exceeds this threshold are labeled as unclassified — they do not match any reference mineral closely enough to warrant a confident identification.

SAM has a particularly valuable property for remote sensing applications: it is invariant to differences in overall illumination brightness. Because the algorithm considers only the direction of the spectral vector and not its magnitude, two pixels containing the same mineral will receive the same classification regardless of whether one is on a brightly lit hillside and the other is in a shadow. This makes SAM robust to the topographic shading variations that are common in mountainous terrain. A confidence score is computed as $C = \max(0, \; 1.0 - \theta_{\min} / \theta_{\text{threshold}})$, providing users with a quantitative measure of how closely each pixel matches its assigned mineral.

### 2.5 Fully Constrained Least Squares (FCLS) Spectral Mixture Analysis

While SAM assigns a single dominant mineral label to each pixel, the reality of 60-meter spatial resolution is that most pixels contain a mixture of two or more minerals. A pixel covering 3600 square meters of desert surface might include patches of exposed calcite bedrock, hematite-stained weathering rinds, and wind-deposited kaolinite dust, all contributing to a single composite reflectance spectrum. Linear Spectral Mixture Analysis (SMA) addresses this by modeling each pixel's spectrum as a linear combination of the reference endmember spectra, weighted by their fractional abundances:

$$\vec{x} = \sum_{k=1}^{M} f_k \, \vec{r}_k + \vec{\epsilon}$$

where $f_k$ is the fractional abundance of endmember $k$, $M$ is the number of endmembers (12), and $\vec{\epsilon}$ is the residual error. The FCLS formulation solves this as a quadratic optimization problem:

$$\min_{\vec{f}} \; \frac{1}{2} \|\vec{x} - \mathbf{M}\vec{f}\|_2^2 \quad \text{subject to} \quad \sum_{k=1}^{M} f_k = 1, \;\; f_k \ge 0 \;\; \forall \, k$$

The two constraints have clear physical meaning: the abundances must sum to one (the pixel is entirely accounted for), and no abundance can be negative (a mineral cannot have a negative fractional presence). The result for each pixel is a vector of 12 fractional abundance values, each representing the estimated proportion of the ground surface occupied by that mineral. The spectral reconstruction quality is measured by the root-mean-square error between the observed spectrum and the modeled mixture:

$$\text{RMSE} = \sqrt{\frac{1}{B} \sum_{i=1}^{B} (x_i - \hat{x}_i)^2}$$

Low RMSE values indicate that the linear mixing model faithfully reproduces the observed spectrum, lending confidence to the derived abundance estimates.

### 2.6 System Architecture

The platform is implemented as a distributed microservice system managed through Docker Compose, comprising 16 interconnected containers. The design follows an event-driven architecture where Apache Kafka 3.8.0 (running in KRaft mode without ZooKeeper) serves as the central message bus, decoupling the individual processing stages and allowing them to scale independently.

At the application layer, a Go-based API gateway handles all incoming HTTP requests from the frontend, manages user sessions through Redis 7.4 caching, and records job metadata in a PostgreSQL 16 database enhanced with PostGIS spatial extensions. When a new analysis job is created, a Go orchestrator decomposes it into a directed acyclic graph (DAG) of tasks — ingestion, preprocessing, and inference — and publishes the appropriate command messages to Kafka topic partitions. Python scientific workers consume these messages and execute the heavy computational work. A Python event sink service monitors all Kafka events to maintain an accurate audit trail and update job state transitions in the database.

For object storage, the platform uses MinIO configured in S3-compatible mode, organizing data into separate prefixes for raw downloads, preprocessed feature matrices, and final GeoTIFF output rasters. All analysis outputs are written as Cloud-Optimized GeoTIFFs (COG) with 256 × 256 internal tiling, Deflate lossless compression, and embedded EPSG:4326 coordinate reference system metadata. The COG format allows web clients to retrieve arbitrary spatial subsets of the rasters through HTTP range requests without downloading the entire file — a critical capability for interactive map visualization.

The frontend is built with React 19 and uses Leaflet for interactive map rendering. It communicates with the backend through a RESTful API and receives real-time job progress updates via Server-Sent Events (SSE). When a job completes, the frontend fetches presigned S3 URLs for the output GeoTIFF layers and renders them as georeferenced overlays on the map, allowing users to visually inspect mineral classifications and abundance distributions across their region of interest.

### 2.7 Deployment Strategy

The platform employs a dual-tier deployment architecture that separates the public-facing presentation layer from the private scientific computing layer. The frontend SPA is deployed to Cloudflare Workers Static Assets through a GitHub CI/CD integration that automatically builds and deploys on every push to the main branch. Cloudflare's global anycast network serves the static assets from over 300 edge nodes worldwide, providing sub-50ms page loads for visitors regardless of their geographic location, all at zero cost on the free tier. SPA client-side routing is handled natively through Cloudflare's `not_found_handling: single-page-application` configuration, which returns the root `index.html` for any unmatched path rather than a 404 error.

The compute-intensive backend, including Kafka, PostgreSQL, MinIO, and all Python workers, runs on a dedicated Docker Compose cluster that can be hosted on either a local workstation for development or a remote VPS for production. This separation means that the public website remains always accessible even when the backend cluster is offline — visitors see a "showcase mode" banner indicating that live analysis requires the backend, but can still explore all static features of the platform.

---

## 3. Results

### 3.1 Classification and Unmixing Accuracy

The platform's mineral identification accuracy was evaluated against held-out test spectra from the USGS Spectral Library Version 7. The SAM classification module achieved an overall accuracy of **94.2%** on the test set, exceeding the project's target threshold of 90%. The 5.8% of misclassified spectra were concentrated among mineralogically similar pairs — specifically, illite was occasionally confused with muscovite (both share a strong Al-OH absorption near 2200 nm), and calcite with dolomite (both exhibit carbonate overtone absorptions near 2320–2340 nm, differing only by approximately 20 nm in band position). These confusions are well documented in the spectroscopic literature and reflect genuine spectral overlap rather than algorithmic failure.

The FCLS spectral mixture analysis achieved a mean absolute error (MAE) of **0.028** against synthetically mixed reference spectra with known ground-truth fractional abundances. This means that, on average, the estimated fractional abundance of each mineral differed from the true value by less than 3 percentage points — well within the project's acceptance threshold of 0.05 MAE. The low RMSE values observed across processed scenes (typically below 0.015) confirm that the linear mixing model provides a faithful representation of the spectral variability in EMIT data.

### 3.2 Pipeline Execution Performance

End-to-end pipeline execution was verified through a complete analysis job (`job_632efec1d3a84f5ab527`) covering a region in the southwestern United States. The job progressed through all three processing stages — ingestion, preprocessing, and inference — in approximately 6 minutes, producing the full set of 9 Cloud-Optimized GeoTIFF raster layers:

| Output Layer | Description | Data Type |
|:---|:---|:---|
| `mineral_class.tif` | Dominant mineral integer ID (0–12) | UInt8 |
| `mineral_confidence.tif` | SAM classification confidence | Float32 |
| `mineral_quality.tif` | Spectral reconstruction fit | Float32 |
| `landcover.tif` | Vegetation, water, soil mask | Byte |
| `mineral_abundance_kaolinite.tif` | Kaolinite fractional abundance | Float32 |
| `mineral_abundance_alunite.tif` | Alunite fractional abundance | Float32 |
| `mineral_abundance_calcite.tif` | Calcite fractional abundance | Float32 |
| `mineral_abundance_quartz.tif` | Quartz fractional abundance | Float32 |
| Additional abundance layers | Remaining endmember fractions | Float32 |

All output rasters were confirmed to contain valid geospatial metadata (EPSG:4326 CRS, correct affine transform, internal tiling), and were successfully rendered as interactive overlays in the Leaflet map interface.

### 3.3 Software Quality and Testing

The codebase underwent comprehensive automated testing across multiple levels:

| Test Category | Framework | Result |
|:---|:---|:---|
| Frontend unit and component tests | Vitest + React Testing Library | **23 / 23 passed** (5 test suites) |
| Frontend static code analysis | oxlint | **0 errors** |
| Preprocessing pipeline tests | pytest | **20 / 20 passed** |
| Frontend production build | Vite 8.3 | Completed in **4.20 seconds** |
| Docker microservice health checks | Docker Compose | **16 / 16 containers healthy** |

The production build generates a total bundle of approximately 507 KB (gzipped to 158 KB), well within acceptable limits for fast initial page loads. Code splitting through Vite's dynamic import system ensures that heavy dependencies like the GeoTIFF decoder and Zstandard decompressor are loaded on demand rather than included in the initial bundle.

### 3.4 Deployment Verification

The Cloudflare deployment was verified through direct HTTP requests to the production URL. The root page (`/`), nested SPA routes (`/jobs`, `/system`), static assets (logo, favicon, manifest), and the `robots.txt` file all returned HTTP 200 status codes. Security headers were confirmed to be present on all responses, including `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy: strict-origin-when-cross-origin`. The Cloudflare build pipeline completed in under 17 seconds total (798 ms for the Vite build itself, with the remainder spent on asset upload and worker deployment), and subsequent pushes to the main branch trigger automatic re-deployment within approximately 30 seconds.

---

## 4. Discussion

### 4.1 Interpretation of Results

The results demonstrate that the combination of SAM classification and FCLS unmixing, applied to a carefully engineered 530-dimensional feature vector, provides reliable mineral identification from spaceborne hyperspectral data. The 94.2% classification accuracy achieved on USGS reference spectra compares favorably with published results in the literature for similar SAM-based mineral mapping studies, which typically report accuracies in the 85–95% range depending on the number of target minerals and spectral similarity among them. The sub-3% mean abundance estimation error achieved by the FCLS unmixing module is particularly encouraging, as it suggests that the platform can provide quantitatively meaningful sub-pixel abundance maps — not just qualitative mineral presence/absence classifications.

The confusion between spectrally similar mineral pairs (illite vs. muscovite, calcite vs. dolomite) is an inherent limitation of the SWIR wavelength range and cannot be fully resolved without additional data sources. In the case of illite and muscovite, both are potassium-bearing phyllosilicates with their primary diagnostic absorption centered near 2200 nm; distinguishing them reliably requires extremely high spectral resolution or supplementary information from the thermal infrared. Similarly, calcite and dolomite differ primarily in whether their carbonate absorption is centered at 2340 nm or 2320 nm — a 20 nm shift that sits at the edge of EMIT's spectral resolution capability. These confusions represent a known boundary of what is achievable with current SWIR-range sensors and are not a deficiency of the platform itself.

### 4.2 Advantages of the Platform Architecture

The event-driven microservice design offers several practical advantages over monolithic processing scripts. By decoupling ingestion, preprocessing, and inference into independent Kafka-connected workers, each stage can be scaled horizontally simply by launching additional container instances. If a research team needs to process a large number of scenes quickly, they can spin up multiple ML inference workers that consume from the same Kafka partition without modifying any code. The architecture also provides natural fault tolerance: if a preprocessing worker crashes mid-computation, the unconsumed Kafka message remains in the queue and will be picked up by another worker or by the same worker after restart, without losing any state or requiring the user to manually re-submit the job.

The separation between the public Cloudflare frontend and the private compute cluster is another deliberate architectural choice that serves multiple purposes. For academic evaluation and collaboration, external reviewers can access the platform's user interface, map layers, and documentation without needing credentials to the backend infrastructure. For cost management, the static frontend runs entirely on Cloudflare's free tier — there is no monthly hosting charge regardless of visitor traffic. And for security, the compute cluster (which holds NASA Earthdata credentials and database access) is never exposed to the public internet in the default deployment configuration.

### 4.3 Limitations

Several limitations should be acknowledged. First, the platform's current mineral library is restricted to 12 endmembers. While these cover the most important dust-source minerals, real geological surfaces contain a far greater diversity of mineral species, and expanding the library to include additional endmembers (rare earth minerals, amphiboles, pyroxenes) would improve the platform's geological applicability. Second, the current deployment does not include GPU acceleration for the machine learning inference stage. While the SAM and FCLS algorithms are computationally tractable on CPU for individual scenes, processing large time-series datasets or continental-scale mosaics would benefit substantially from GPU parallelization. Third, the public website operates in a read-only showcase mode and cannot execute live analysis jobs without a running backend cluster. This is a deliberate design tradeoff — running compute infrastructure on the public internet would introduce both cost and security concerns — but it does mean that casual visitors cannot experience the full analysis workflow firsthand.

Finally, the platform has been validated primarily against reference spectra from the western United States, where EMIT's coverage is densest and the semi-arid terrain provides good mineral exposure. Applying the same endmember library and classification thresholds to other geographic regions (the Sahara, the Arabian Peninsula, or the Thar Desert) would require additional validation against local ground-truth data.

### 4.4 Future Work

Several directions for future development are planned. The most immediate priority is deploying the backend compute cluster on a dedicated cloud VPS, which would allow the public website to route analysis requests to a persistent backend rather than requiring users to maintain their own local Docker installation. A custom domain (mineralanalysisplatform.in) is planned to replace the current workers.dev subdomain. On the scientific side, future work will focus on expanding the endmember library beyond 12 minerals, integrating thermal infrared data from complementary sensors (such as ECOSTRESS on the ISS) to resolve the calcite-dolomite and illite-muscovite ambiguities, and incorporating temporal analysis capabilities to track how mineral exposure patterns change with seasonal dust mobilization events. On the engineering side, GPU inference support through CUDA-enabled PyTorch containers, and integration with cloud-native geospatial catalogs such as STAC (SpatioTemporal Asset Catalog), are both under consideration.

---

## 5. References

1. Green, R. O., et al. (2022). "The Earth Surface Mineral Dust Source Investigation: An Earth Science Imaging Spectroscopy Mission." *2022 IEEE Aerospace Conference*.
2. Kokaly, R. F., et al. (2017). "USGS Spectral Library Version 7." *U.S. Geological Survey Data Series 1035*.
3. Kruse, F. A., et al. (1993). "The Spectral Image Processing System (SIPS) — Interactive Visualization and Analysis of Imaging Spectrometer Data." *Remote Sensing of Environment*, 44(2–3), 145–163.
4. Heinz, D. C., & Chang, C.-I. (2001). "Fully Constrained Least Squares Linear Spectral Mixture Analysis Method for Material Quantification in Hyperspectral Imagery." *IEEE Transactions on Geoscience and Remote Sensing*, 39(3), 529–545.
5. Clark, R. N. (1999). "Spectroscopy of Rocks and Minerals, and Principles of Spectroscopy." In *Manual of Remote Sensing, Volume 3: Remote Sensing for the Earth Sciences* (pp. 3–58). John Wiley & Sons.
6. Savitzky, A., & Golay, M. J. E. (1964). "Smoothing and Differentiation of Data by Simplified Least Squares Procedures." *Analytical Chemistry*, 36(8), 1627–1639.

---

*Report generated for the Mineral Analysis Platform v1.0.0. Public website accessible at https://mineral-analysis.ananthans-ds25.workers.dev.*
