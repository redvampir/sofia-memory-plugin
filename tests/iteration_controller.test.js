const assert = require('assert');
const IterationController = require('../src/generator/IterationController');

class MockOptimizer {
  getConfig() {
    return { iterationCap: 2, timeBudget: 1000 };
  }
}

(function run() {
  const controller = new IterationController({
    resourceOptimizer: new MockOptimizer(),
    qualityTarget: 0.8
  });

  const start = Date.now();

  // Backwards compatibility with old signature
  assert(
    controller.shouldContinue(0, 'resp', {}),
    'supports old signature'
  );

  // Should continue when gaps remain and under limits
  assert(
    controller.shouldContinue({
      iteration: 0,
      quality: 0.5,
      remainingGaps: ['gap'],
      startTime: start
    }),
    'continues with remaining gaps'
  );

  // Should stop when iteration cap reached
  assert(
    !controller.shouldContinue({
      iteration: 2,
      quality: 0.5,
      remainingGaps: ['gap'],
      startTime: start
    }),
    'stops at iteration cap'
  );

  // Should stop when quality target met and no gaps
  assert(
    !controller.shouldContinue({
      iteration: 1,
      quality: 0.85,
      remainingGaps: [],
      startTime: start
    }),
    'stops when quality target met and no gaps'
  );

  // Should stop when time budget exceeded
  assert(
    !controller.shouldContinue({
      iteration: 1,
      quality: 0.5,
      remainingGaps: ['gap'],
      startTime: start - 2000
    }),
    'stops when time budget exceeded'
  );

  console.log('iteration controller tests passed');
})();
