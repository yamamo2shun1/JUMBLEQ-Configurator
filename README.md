# JUMBLEQ Configurator

This Next.js Web app configures JUMBLEQ routing, channel faders, DVS, and magnetic-switch settings. It is designed for deployment with LOLIPOP! Deploy Now.

Live app: [https://configurator.jumbleq.io](https://configurator.jumbleq.io)

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
npm start
```

The development server is available at `http://localhost:3000`.

## Validation

```bash
npm test
npm run test:e2e
```

`npm test` runs the MIDI protocol and preset-processing unit tests, linting, and a production build for deployment.

`npm run test:e2e` uses Chromium through Playwright and emulates a Web MIDI device to verify:

- Connection to JUMBLEQ and initial synchronization
- Setting changes, curve editing, and the EEPROM save command
- Automatic reconnection after USB disconnection
- Preset import and export

Install the browser used for E2E testing before running the tests for the first time:

```bash
npx playwright install chromium
```

Use `npm run test:all` to run all validation steps in sequence.

## Deploy Now

`next.config.ts` sets `output: "standalone"`, as required by Deploy Now. The `postbuild` script includes the public files and Next.js static assets in the standalone output. Use the repository root as the application root when deploying.

The `.github/workflows/deploy.yml` workflow validates and deploys the application whenever a commit is pushed to `main`, including when a pull request is merged. It deploys to the existing `jumbleq-configurator` Deploy Now project.

Before enabling the workflow, add the local Deploy Now credentials as the repository secret `LOLIPOP_CREDENTIALS_BASE64`. On Windows, with the GitHub CLI installed and authenticated, run this PowerShell command from any directory:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:APPDATA\lolipop\credentials.json")) | gh secret set LOLIPOP_CREDENTIALS_BASE64 --repo yamamo2shun1/JUMBLEQ-Configurator
```

The workflow restores the credentials only for the deploy job and restricts the generated file to the current runner user. The secret must be refreshed if the Deploy Now session is revoked or expires.
