# Rosetta T11 Renderer — Render deployment package

This package contains the recovered T11 TradingView Lightweight Charts web artifact prepared for Render Static Sites.

## Runtime
- Pure static HTML/JS
- TradingView Lightweight Charts 5.2.1 is installed at build time and copied into the deployed bundle, so runtime rendering does not depend on a CDN.

## Render
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Infrastructure definition: `render.yaml`

## Local build
```bash
npm install
npm run build
```
Then serve `dist/` with any static file server.

## Deployment prerequisite
Push this directory to a GitHub, GitLab, or Bitbucket repository. Render can then deploy it as a Static Site or from the included Blueprint.
