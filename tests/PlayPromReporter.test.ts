/// <reference types="jest" />
import PlayPromReporter from '../src/PlayPromReporter';
import { StatsD } from 'hot-shots';
import type { TestCase, TestResult, FullResult, TestStep } from '@playwright/test/reporter';

// Mock hot-shots
jest.mock('hot-shots');

describe('PlayPromReporter', () => {
  let mockStatsDInstance: jest.Mocked<StatsD>;
  let consoleErrorSpy: jest.SpyInstance;

  const validOptions = {
    host: 'localhost',
    port: 1234,
    project: 'AcmeApp',
    env: 'ci',
    testType: 'e2e'
  };

  beforeEach(() => {
    // Clear mock data before every test
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Initialization', () => {
    it('should log errors if required options are missing', () => {
      new PlayPromReporter({} as any);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('[playprom] missing host option');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[playprom] missing port option');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[playprom] missing project option');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[playprom] missing testType option');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[playprom] missing env option');
    });

    it('should initialize StatsD with correctly mapped options', () => {
      new PlayPromReporter(validOptions);
      
      expect(StatsD).toHaveBeenCalledWith(expect.objectContaining({
        host: 'localhost',
        port: 1234,
        protocol: 'udp',
        tcpGracefulErrorHandling: false,
        globalTags: { project: 'AcmeApp', testType: 'e2e', env: 'ci' }
      }));
    });

    it('should log to console if hot-shots encounters an error', () => {
      new PlayPromReporter(validOptions);
      
      // Extract the error handler passed into StatsD
      const mockCallArgs = (StatsD as jest.Mock).mock.calls[0][0];
      const errorHandler = mockCallArgs.errorHandler;
      
      const testError = new Error('UDP socket closed');
      errorHandler(testError);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('PlayProm error:', testError);
    });
  });

  describe('Emitting Metrics (onTestEnd)', () => {
    let reporter: PlayPromReporter;

    beforeEach(() => {
      reporter = new PlayPromReporter(validOptions);
      mockStatsDInstance = (StatsD as jest.Mock).mock.instances[0] as jest.Mocked<StatsD>;
    });

    it('should send metrics correctly on test end', () => {
      const mockTest = {
        location: { file: 'login.spec.ts', line: 10, column: 5 },
        tags: ['@fast', '@p0'],
        parent: {
          project: () => ({ name: 'chromium' })
        }
      } as unknown as TestCase;

      const mockResult = {
        duration: 1500,
        status: 'passed',
        retry: 0
      } as unknown as TestResult;

      reporter.onTestEnd(mockTest, mockResult);

      const expectedTags = [
        'status:passed',
        'suite:chromium',
        'file:login.spec.ts',
        'is_retry:false',
        'tag:fast',
        'tag:p0'
      ];

      expect(mockStatsDInstance.timing).toHaveBeenCalledWith('playprom.test.duration', 1500, expectedTags);
      expect(mockStatsDInstance.increment).toHaveBeenCalledWith('playprom.test.result', 1, expectedTags);
    });

    it('should format tags properly for retries', () => {
      const mockTest = {
          location: { file: 'profile.spec.ts', line: 1, column: 1 },
          tags: [],
          parent: {
              project: () => undefined // 'unknown' switch
          }
      } as unknown as TestCase;

      const mockResult = { duration: 100, status: 'failed', retry: 1 } as any;
      reporter.onTestEnd(mockTest, mockResult);

      const expectedTags = [
          'status:failed',
          'suite:unknown',
          'file:profile.spec.ts',
          'is_retry:true'
      ];

      expect(mockStatsDInstance.timing).toHaveBeenCalledWith('playprom.test.duration', 100, expectedTags);
      expect(mockStatsDInstance.increment).toHaveBeenCalledWith('playprom.test.result', 1, expectedTags);
    });
  });

  describe('Emitting Step Metrics (onStepEnd)', () => {
    let reporter: PlayPromReporter;

    beforeEach(() => {
      reporter = new PlayPromReporter(validOptions);
      mockStatsDInstance = (StatsD as jest.Mock).mock.instances[0] as jest.Mocked<StatsD>;
    });

    it('should ignore non-step and non-hook categories', () => {
      const mockStep = { category: 'expect', duration: 50, title: 'expect.toBe' } as any;
      reporter.onStepEnd({} as any, {} as any, mockStep);
      expect(mockStatsDInstance.timing).not.toHaveBeenCalled();
    });

    it('should send step duration metric accurately', () => {
      const mockTest = {
        location: { file: 'checkout.spec.ts', line: 5, column: 1 },
        parent: { project: () => ({ name: 'webkit' }) }
      } as unknown as TestCase;

      const mockResult = { retry: 0 } as any;

      const mockStep = {
        title: 'Click Checkout Button!',
        category: 'test.step',
        duration: 450,
        error: undefined
      } as unknown as TestStep;

      reporter.onStepEnd(mockTest, mockResult, mockStep);

      const expectedTags = [
        'step_category:test.step',
        'step_title:Click_Checkout_Button_',
        'status:passed',
        'suite:webkit',
        'file:checkout.spec.ts',
        'is_retry:false'
      ];

      expect(mockStatsDInstance.timing).toHaveBeenCalledWith('playprom.step.duration', 450, expectedTags);
      
      // Should not call increment flag
      expect(mockStatsDInstance.increment).not.toHaveBeenCalled();
    });

    it('should format failed hooks correctly', () => {
      const mockTest = {
        location: { file: 'setup.ts', line: 1, column: 1 },
        parent: { project: () => undefined }
      } as unknown as TestCase;

      const mockResult = { retry: 1 } as any;

      const mockStep = {
        title: 'beforeAll',
        category: 'hook',
        duration: 900,
        error: new Error('Timeout')
      } as unknown as TestStep;

      reporter.onStepEnd(mockTest, mockResult, mockStep);

      const expectedTags = [
        'step_category:hook',
        'step_title:beforeAll',
        'status:failed',
        'suite:unknown',
        'file:setup.ts',
        'is_retry:true'
      ];

      expect(mockStatsDInstance.timing).toHaveBeenCalledWith('playprom.step.duration', 900, expectedTags);
    });
  });

  describe('Cleanup (onEnd)', () => {
    it('should close the statsd client nicely on end and emit run duration', async () => {
      const reporter = new PlayPromReporter(validOptions);
      const instance = (StatsD as jest.Mock).mock.instances[0] as jest.Mocked<StatsD>;
      
      // Mock the close method to execute its callback instantly
      instance.close.mockImplementation((cb: any) => {
        if (cb) cb();
      });

      const mockFullResult = { status: 'passed', duration: 45000 } as unknown as FullResult;
      
      await reporter.onEnd(mockFullResult);

      // Assert global run metric fired
      expect(instance.timing).toHaveBeenCalledWith('playprom.run.duration', 45000, ['status:passed']);

      expect(instance.close).toHaveBeenCalled();
    });

    it('should log an error if closing fails', async () => {
      const reporter = new PlayPromReporter(validOptions);
      const instance = (StatsD as jest.Mock).mock.instances[0] as jest.Mocked<StatsD>;
      
      const mockError = new Error('Failure closing wrapper');
      instance.close.mockImplementation((cb: any) => {
        if (cb) cb(mockError);
      });

      await reporter.onEnd({} as any);
      expect(consoleErrorSpy).toHaveBeenCalledWith('PlayProm error closing client:', mockError);
    });
  });
});
