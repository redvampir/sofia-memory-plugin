process.env.NO_GIT = "true";
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SessionSummarizer = require('../src/generator/summarization/SessionSummarizer');

(function run() {
  const tempDir = path.join(__dirname, 'tmp_summarizer');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  const summarizer = new SessionSummarizer({ memoryRoot: tempDir });

  const question = 'This is a very long question that should be trimmed when creating a summary.';
  const answer = 'This is an even longer answer that contains lots of details and also should be trimmed in the summary representation.';

  const summary = summarizer.summarizePair(question, answer);
  const sessionId = 'session-test';
  const { questionPath, answerPath, summaryPath } = summarizer.storeSummary(
    sessionId,
    summary,
    question,
    answer
  );

  assert.ok(fs.existsSync(summaryPath), 'summary file should be created');
  assert.ok(fs.existsSync(questionPath), 'question file should be created');
  assert.ok(fs.existsSync(answerPath), 'answer file should be created');

  const storedSummary = summarizer.getSummary(sessionId);
  assert.strictEqual(storedSummary, summary, 'summary should be retrievable');

  const restoredQuestion = summarizer.getFullText(questionPath);
  const restoredAnswer = summarizer.getFullText(answerPath);
  assert.strictEqual(restoredQuestion, question, 'question restored correctly');
  assert.strictEqual(restoredAnswer, answer, 'answer restored correctly');

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('session summarizer test passed');
})();
