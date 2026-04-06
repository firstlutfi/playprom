# @firstlutfi/playprom

A lightweight custom Playwright reporter that pushes test metrics to StatsD (and Prometheus via the StatsD Exporter). Built natively on top of the robust `hot-shots` client to solve the ephemeral nature of CI test runners, without slowing down your test execution.

## Why PlayProm?

Playwright's built-in reporters are excellent for single-run visibility, but they are limited when it comes to:

- Historical trend analysis
- Cross-team visibility
- Flakiness detection
- CI pipeline performance monitoring

PlayProm bridges this gap by turning test execution into time-series metrics, enabling you to leverage observability tools like Grafana for deeper insights.

## When NOT to use PlayProm

PlayProm is designed for event-based test observability using time-series metrics. However, it may not be suitable in the following scenarios:

### 1. You only need single-run test reports
If your use case is limited to viewing results of a single test execution (e.g., debugging locally or reviewing a single CI run), Playwright’s built-in reporters (HTML, JSON) are often sufficient and simpler.

---

### 2. Your infrastructure cannot handle high-cardinality metrics
PlayProm emits rich tags such as `suite`, `file`, and step-level metadata. In large test suites, this may significantly increase metric cardinality and impact Prometheus performance.

If your observability stack has strict cardinality limits, consider:
- Reducing dynamic tags
- Using stable identifiers only

---

### 3. You prefer a fully managed observability solution
PlayProm integrates best with Prometheus + Grafana stacks. If your organization already relies on managed platforms like Datadog, consider sending metrics directly to their agents instead of using this pipeline.

## Architecture

PlayProm emits metrics using the StatsD protocol via UDP. These metrics are typically consumed by a StatsD-compatible agent (e.g., statsd-exporter), which exposes them to Prometheus for scraping.

Playwright → PlayProm → StatsD → Prometheus → Grafana

## Installation

```bash
npm install -D @firstlutfi/playprom
```

## Usage

In your `playwright.config.ts`, add the custom reporter:

```typescript
import { defineConfig } from '@playwright/test';
import type { PlayPromOptions } from '@firstlutfi/playprom';

export default defineConfig({
  reporter: [
    ['html'], // You can safely keep the default HTML reporter alongside PlayProm
    ['@firstlutfi/playprom', {
      host: '127.0.0.1',           // Your StatsD agent host
      port: 8125,                  // Your StatsD agent UDP port
      protocol: 'udp',             // Optional. Defaults to UDP.
      project: 'my-frontend-app',  // Attached as a global tag to all metrics for filtering purpose
      testType: 'regression',      // Attached as a global tag to all metrics for filtering purpose
      env: 'ci'                    // Attached as a global tag to all metrics for filtering purpose
    } satisfies PlayPromOptions],
  ],
});
```

*Note: Built-in Playwright project runs (like Chromium, Webkit) are emitted under the tag `suite` to prevent colliding with your configuration's global `project` naming scheme.*

---

## Metrics Emitted

This reporter actively emits telemetry data during three distinct Playwright lifecycles: **Test-Level**, **Step-Level**, and **Run-Level**. 

*(All metrics automatically inherit the global tags defined in your configuration options).*

### 1. Test-Level Metrics
Fired immediately after an individual test finishes execution.

- `playprom.test.result` (Counter): Incremented by 1 when a test finishes.
- `playprom.test.duration` (Timing): Time taken for the test to execute in milliseconds.

#### Tags included:
- `status`: (`passed`, `failed`, `skipped`, `timedOut`, `interrupted`)
- `suite`: The Playwright project name (e.g., `chromium`)
- `file`: The physical path of the test file
- `is_retry`: (`true` or `false`)
- Any specific `@tags` specified in your Playwright test titles (e.g., `@slow`, `@p0`)

### 2. Step-Level Metrics
Fired immediately after an explicit `test.step()` or `hook` finishes. (Internal background actions like `expect` or `locator` resolving are ignored to prevent dataset bloating).

- `playprom.step.duration` (Timing): Time taken for the explicit step to execute.

#### Tags included:
- `step_title`: The specific name of the step (cleaned for StatsD string safety)
- `step_category`: (`test.step` or `hook`)
- `status`: (`passed`, `failed`)
- `suite`: The parent Playwright project name
- `file`: The path of the parent test file
- `is_retry`: (`true`, `false`)

### 3. Run-Level Metrics
Fired securely at the very end of the entire test pipeline execution (`onEnd`). 

This tracks the aggregate pipeline efficiency and binary pass/fail condition of the complete CI run on a macro-level.

- `playprom.run.duration` (Timing): Total time taken for the entire test suite run to execute.

#### Tags included:
- `status`: (`passed`, `failed`, `timedOut`, `interrupted`)

---

## Contributing & Local Development

We have bundled a fully mocked local Observability stack alongside this repository containing Prometheus, Grafana, and the official StatsD Exporter! 

This allows you to safely develop, modify, and test the reporter natively without setting up heavy cloud infrastructure.

#### 1. Spin up the Stack
Boot the infrastructure logic locally:
```bash
# Starts Prom, Grafana (port 3000), and a UDP StatsD listener (port 8125)
docker-compose up -d
```

#### 2. Generate Development Telemetry
Run the included dummy Playwright test suite to automatically push valid test metrics into the active Docker stack:
```bash
# Triggers Demo pass/fails using your local source-code
npx playwright test -c example/playwright.config.ts
```

#### 3. Verify Metrics in Grafana
- Head over to `http://localhost:3000`
- Log in with credentials `admin` / `admin`
- Under **Data Sources**, add **Prometheus** and map the URL to `http://prometheus:9090`
- Hit **Explore** and search for `playprom` to view your live data perfectly structured!

#### 4. Run Unit Tests
Before pushing any core changes to `PlayPromReporter.ts`, please verify your mappings using the included Jest suite. We aggressively mock the UDP client to prevent arbitrary packet firing during testing.

```bash
npm run build && npm test
```
