import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep
} from '@playwright/test/reporter';
import { StatsD } from 'hot-shots';

export interface PlayPromOptions {
  host: string;
  port: number;
  protocol?: 'udp' | 'tcp';
  project: string;
  testType: string;
  env: string;
  debugMode?: boolean;
}

export default class PlayPromReporter implements Reporter {
  private statsd: StatsD;

  constructor(options: PlayPromOptions) {
    if (!options.host) {
      console.error("[playprom] missing host option");
    }

    if (!options.port) {
      console.error("[playprom] missing port option");
    }

    if (!options.project) {
      console.error("[playprom] missing project option");
    }

    if (!options.testType) {
      console.error("[playprom] missing testType option");
    }

    if (!options.env) {
      console.error("[playprom] missing env option");
    }

    console.log("[playprom] client initialized", {
      host: options.host,
      port: options.port,
      project: options.project,
      test_type: options.testType
    });

    this.statsd = new StatsD({
      host: options.host,
      port: options.port,
      protocol: options.protocol || 'udp',
      tcpGracefulErrorHandling: options.protocol === 'tcp',
      globalTags: {
        project: options.project,
        testType: options.testType,
        env: options.env
      },
      errorHandler: (error) => {
        console.error('PlayProm error:', error);
      },
    });
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    // We only want to track explicit steps and key hooks, not every single internal `expect` or `locator` action
    if (step.category !== 'test.step' && step.category !== 'hook') {
      return;
    }

    const duration = step.duration;
    const status = step.error ? 'failed' : 'passed';
    const suite = test.parent.project()?.name || 'unknown';
    const file = test.location.file;
    const isRetry = result.retry > 0 ? 'true' : 'false';
    const safeTitle = step.title.replace(/[^a-zA-Z0-9_-]/g, '_');

    const tagsArray = [
      `step_category:${step.category}`,
      `step_title:${safeTitle}`,
      `status:${status}`,
      `suite:${suite}`,
      `file:${file}`,
      `is_retry:${isRetry}`,
    ];

    this.statsd.timing('playprom.step.duration', duration, tagsArray);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const duration = result.duration;
    const status = result.status; // 'passed', 'failed', 'timedOut', 'skipped', 'interrupted'

    const suite = test.parent.project()?.name || 'unknown';
    const file = test.location.file;
    const isRetry = result.retry > 0 ? 'true' : 'false';

    // Prepare tags for StatsD
    const tagsArray = [
      `status:${status}`,
      `suite:${suite}`,
      `file:${file}`,
      `is_retry:${isRetry}`,
    ];

    if (test.tags && test.tags.length > 0) {
      test.tags.forEach(t => tagsArray.push(`tag:${t.replace(/[^a-zA-Z0-9_-]/g, '')}`));
    }

    // Emit test duration timing
    this.statsd.timing('playprom.test.duration', duration, tagsArray);

    // Emit test result counter
    this.statsd.increment('playprom.test.result', 1, tagsArray);
  }

  async onEnd(result: FullResult) {
    // Emit the macro-level suite run duration and final status
    const tagsArray = [`status:${result.status}`];
    this.statsd.timing('playprom.run.duration', result.duration, tagsArray);

    // Close the statsd client to ensure the UDP buffer is flushed before exit
    return new Promise<void>((resolve) => {
      this.statsd.close((error?: Error) => {
        if (error) {
          console.error('PlayProm error closing client:', error);
        }
        resolve();
      });
    });
  }
}
