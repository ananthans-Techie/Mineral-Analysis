# FREE FRONTEND DEPLOYMENT GUIDE
## Mineral Analysis Platform — mineralanalysisplatform.in

This guide documents the architecture, preparation, configuration, and step-by-step procedures for deploying the **Mineral Analysis Platform** frontend to **Cloudflare Pages (Free Plan)** with custom domain binding to `mineralanalysisplatform.in` and `www.mineralanalysisplatform.in`.

---

## 1. Hosting Architecture & Strategy

### 1.1 Architecture Overview

The Mineral Analysis Platform implements a secure **two-tier hybrid architecture**:

```
                       PUBLIC INTERNET (HTTPS)
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
       https://mineralanalysisplatform.in   https://www.mineralanalysisplatform.in
                   │                           │
                   └─────────────┬─────────────┘
                                 ▼
                     Cloudflare Global Edge Network
                     (300+ Edge Data Centers, Free SSL)
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
        Cloudflare Pages Hosting       Cloudflare Edge Security
        - Single Page Application     - Strict HTTPS enforcement
        - Static Assets (JS/CSS/PNG)   - Security headers (_headers)
        - SPA Rewrites (_redirects)   - DDOS mitigation
                                 │
                   (No public route to localhost)
                                 │
        ─────────────────────────────────────────────────
                     ISOLATION BOUNDARY
        ─────────────────────────────────────────────────
                                 │
                     PRIVATE LOCAL INFRASTRUCTURE
                      http://localhost:3000
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
  Go API Gateway          Go Orchestrator           PostgreSQL + PostGIS
  (Dual Replicas)         (Task Dispatcher)         (Geospatial DB)
        │                        │                        │
        ▼                        ▼                        ▼
  Apache Kafka KRaft      MinIO S3 Storage          Redis 7.4 Caching
  (Event Streaming)       (GeoTIFF Rasters)         (Rate limiting)
        │
        ▼
  ML Inference & Ingestion Workers (PyTorch, ResNet-1D, SAM + SMA)
```

### 1.2 Separation of Concerns

| Capability | Public Website (`mineralanalysisplatform.in`) | Local Infrastructure (`http://localhost:3000`) |
| :--- | :--- | :--- |
| **Hosting** | Cloudflare Pages (Free Plan) | Docker Compose on Windows / VPS |
| **Authentication** | Public Research Showcase (No login required) | Local Admin Bypass (`dev@mineralanalysis.local`) |
| **Compute / Inference** | Disabled (Explains cluster requirement) | Active (PyTorch, SAM, SMA, 530-band feature extraction) |
| **Mapping & UI** | Interactive Leaflet AreaMap & USGS endmembers | Interactive Leaflet AreaMap + Live GeoTIFF overlays |
| **Storage & DB** | Static CDN assets only | MinIO S3 bucket (`emit-rasters`) + PostGIS tables |
| **Cost** | **$0.00 / month forever** (Genuinely Free) | Local compute resources |

---

## 2. Pre-Deployment Frontend Audit & Hardening

The frontend codebase has been prepared and verified:

1. **SPA Routing**: Configured `frontend/public/_redirects` with `/* /index.html 200` to prevent 404 errors on deep-link routes (`/jobs`, `/system`, etc.).
2. **Security Headers**: Configured `frontend/public/_headers` with `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and immutable asset caching.
3. **SEO & Metadata**: Enhanced `frontend/index.html` with Open Graph, Twitter Cards, canonical URL, and search engine directives (`robots.txt`).
4. **Official Branding**: Integrated the official high-resolution Mineral Analysis Platform logo (`/assets/mineral-analysis-logo.png`) across desktop headers, auth cards, favicons (`favicon.ico`, `favicon.png`), and web application manifest (`manifest.json`). Tagline: `Explore • Analyze • Discover`.
5. **Zero Localhost Exposure**: Scanned all production bundles in `dist/`. No hardcoded `localhost`, `127.0.0.1`, private API tokens, or AWS credentials exist in client code.
6. **Graceful Public Fallback**: When API endpoints return non-JSON responses (static CDN fallback), the UI automatically detects public mode, suppresses connection errors, and presents the authentic USGS 12-endmember scientific specifications.
7. **Local Environment Preserved**: The existing Docker Compose stack (`http://localhost:3000`) remains 100% operational with all 16 containers healthy.

---

## 3. Cloudflare Pages Deployment Procedures

Cloudflare Pages provides two deployment methods on the Free Plan. **Option A (Git Integration)** is recommended for continuous, automated deployments.

### Option A: Cloudflare Pages Git Integration (Recommended)

1. **Sign in to Cloudflare**:
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and log in (or create a free account).
2. **Navigate to Pages**:
   - In the left sidebar, click **Compute (Workers & Pages)** $\to$ **Create application** $\to$ **Pages** $\to$ **Connect to Git**.
3. **Connect GitHub**:
   - Click **Connect GitHub**.
   - Authorize access to your repository:
     `ananthans-Techie/Mineral-Analysis`
4. **Configure Build Settings (Verified & Exact)**:
   - **Project Name**: `mineral-analysis-platform` (Generates: `https://mineral-analysis-platform.pages.dev`)
   - **Production Branch**: `main` (Latest commit: `3a4c407`)
   - **Framework Preset**: `Vite`
   - **Root Directory**: `remote_sensing_pipeline-production/frontend`
   - **Build Command**: `npm run build`
   - **Build Output Directory**: `dist`
5. **Environment Variables**:
   - None required. (Optionally set `NODE_VERSION`: `22` if desired).
6. **Deploy**:
   - Click **Save and Deploy**.
   - Cloudflare will clone the repo, install dependencies from `remote_sensing_pipeline-production/frontend`, execute `npm run build`, and deploy the production bundle to `https://mineral-analysis-platform.pages.dev`.

---

### Option B: Direct Terminal / CLI Upload (Wrangler)

If you prefer terminal-driven deployment:
1. Authenticate with your Cloudflare account:
   ```powershell
   npx wrangler login
   ```
   *(A browser window opens to authorize Wrangler with 1 click).*
2. Deploy the pre-built `dist` folder:
   ```powershell
   cd "C:\Users\sanan\OneDrive\Documents\Spatial Big Data\Project\Mineral-Analysis"
   npx wrangler pages deploy "remote_sensing_pipeline-production/frontend/dist" --project-name=mineral-analysis-platform
   ```

---

## 4. Custom Domain & DNS Configuration

### 4.1 Prerequisites & Verification
Google DNS query for `mineralanalysisplatform.in` currently returns `NXDOMAIN` (Non-existent domain).
Before configuring DNS in Cloudflare:
1. Ensure the domain `mineralanalysisplatform.in` is registered at your domain registrar (e.g., GoDaddy, Namecheap, Hostinger, BigRock, Cloudflare Registrar).
2. Ensure you have administrative access to the registrar's DNS management console.

### 4.2 Connecting Custom Domain in Cloudflare Pages
1. In the Cloudflare Dashboard, select your Pages project: **mineral-analysis-platform**.
2. Click **Custom domains** tab $\to$ **Set up a custom domain**.
3. Enter `mineralanalysisplatform.in` and click **Continue**.
4. Add the secondary domain: enter `www.mineralanalysisplatform.in` and click **Continue**.

### 4.3 Required DNS Records

Depending on how your domain DNS is managed:

#### Scenario 1: Domain uses Cloudflare Nameservers (Recommended)
If you manage the entire domain DNS inside Cloudflare (Cloudflare Free Zone):
- Cloudflare automatically adds the required CNAME records for apex and `www` with CNAME flattening.
- **Apex Record**:
  - Type: `CNAME`
  - Name: `@` (or `mineralanalysisplatform.in`)
  - Target: `mineral-analysis-platform.pages.dev`
  - Proxy Status: **Proxied (Orange Cloud)**
- **WWW Record**:
  - Type: `CNAME`
  - Name: `www`
  - Target: `mineral-analysis-platform.pages.dev`
  - Proxy Status: **Proxied (Orange Cloud)**

#### Scenario 2: Domain managed at External Registrar (External DNS)
If your nameservers remain at your external registrar:
1. Log into your domain registrar's DNS Management page.
2. Add the following DNS verification / alias records:
   - **WWW Subdomain**:
     - Type: `CNAME`
     - Host / Name: `www`
     - Value / Target: `mineral-analysis-platform.pages.dev`
     - TTL: Auto or 3600
   - **Root / Apex Domain**:
     - *If your registrar supports ANAME / ALIAS / CNAME Flattening*:
       - Type: `ALIAS` / `ANAME`
       - Host: `@`
       - Value: `mineral-analysis-platform.pages.dev`
     - *If your registrar only supports CNAME on subdomains*:
       - Configure a URL Redirect / Forwarding rule at the registrar from `https://mineralanalysisplatform.in` $\to$ `https://www.mineralanalysisplatform.in`.

### 4.4 Canonical Redirect (`www` to Apex)
To ensure `https://www.mineralanalysisplatform.in` redirects seamlessly to `https://mineralanalysisplatform.in`:
1. In Cloudflare Dashboard, go to **Rules** $\to$ **Redirect Rules** (or **Page Rules**).
2. Create Rule:
   - **Name**: "Redirect WWW to Apex"
   - **Incoming HTTP requests where**:
     `Hostname equals www.mineralanalysisplatform.in`
   - **Action**: Dynamic Redirect
   - **Target URL**:
     `concat("https://mineralanalysisplatform.in", http.request.uri.path)`
   - **Status code**: 301 (Permanent Redirect)

### 4.5 SSL/TLS Configuration
- In Cloudflare Dashboard, go to **SSL/TLS** $\to$ **Overview**.
- Ensure encryption mode is set to **Full** (or **Flexible** for Pages-only static hosting).
- Enable **Always Use HTTPS**: **SSL/TLS** $\to$ **Edge Certificates** $\to$ toggle **Always Use HTTPS** to **ON**.
- Cloudflare automatically provisions an SSL certificate (Let's Encrypt / Google Trust Services) with zero intervention and auto-renews it indefinitely.

---

## 5. Build & Pre-Publication Validation Checklist

Before confirming public deployment, verify that all validation steps pass:

| Check | Expected Result | Verified Status |
| :--- | :--- | :---: |
| Frontend Tests | 23/23 tests pass across 5 suites | **PASS** |
| Linter (`oxlint`) | 0 errors | **PASS** |
| Production Build | `vite build` completes in `< 5s` | **PASS** (4.20s) |
| SPA Fallback | `dist/_redirects` contains `/* /index.html 200` | **PASS** |
| Security Headers | `dist/_headers` present | **PASS** |
| Search Engine Indexing | `dist/robots.txt` present | **PASS** |
| Asset Verification | Official logo at `dist/assets/mineral-analysis-logo.png` | **PASS** |
| Favicons | `favicon.ico`, `favicon.png`, `icon-192`, `icon-512` present | **PASS** |
| Localhost Leakage Scan | Zero localhost calls in application code | **PASS** |
| Local Docker Application | `http://localhost:3000` healthy (16/16 containers) | **PASS** |

---

## 6. Maintenance, Updates & Rollback

### Continuous Deployment (Updates)
- Whenever changes are made to the frontend:
  ```powershell
  git add frontend/
  git commit -m "Update frontend features"
  git push origin main
  ```
- Cloudflare Pages will automatically detect the commit, trigger a build, and publish the update globally within 60 seconds.

### Instant Rollback
- If an update causes an unexpected issue:
  1. Open Cloudflare Dashboard $\to$ **Workers & Pages** $\to$ **mineral-analysis-platform**.
  2. Go to **Deployments** tab.
  3. Locate any previous successful deployment.
  4. Click the three dots (`...`) $\to$ **Rollback to this deployment**.
  5. The previous version is restored instantly across all edge nodes with zero downtime.

---

## 7. Cloudflare Pages Free Plan Limits

Cloudflare Pages Free Tier is genuinely free with no hidden fees or charges:
- **Bandwidth**: Unlimited.
- **Requests**: Unlimited.
- **Builds**: 500 builds per month (ample for continuous development).
- **Custom Domains**: Up to 100 custom domains per project.
- **Concurrent Builds**: 1 concurrent build.
- **SSL Certificates**: Free, automatically managed, auto-renewed.
- **DDoS Protection**: Included by default.

