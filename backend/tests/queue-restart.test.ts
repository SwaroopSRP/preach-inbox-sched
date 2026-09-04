import { describe, it, expect, afterAll } from 'vitest';
import { emailQueue, enqueueEmailJob } from '../src/queue/email.queue.js';
import { createEmailWorker } from '../src/workers/email.worker.js';

describe('BullMQ Delayed Jobs & Restart Persistence', () => {
  const cleanupWorkers: Array<{ close: () => Promise<void> }> = [];

  afterAll(async () => {
    for (const w of cleanupWorkers) {
      await w.close();
    }
    await emailQueue.close();
  });

  it('preserves delayed jobs in Redis even when workers are offline, and executes when worker restarts', async () => {
    const emailId = 'email-restart-' + Date.now();
    const delayMs = 1500;

    // 1. Enqueue job before worker exists
    const job = await enqueueEmailJob(emailId, delayMs);
    expect(job.id).toBe(emailId);

    // 2. Verify state is delayed in Redis
    const state = await job.getState();
    expect(state).toBe('delayed');

    // 3. Wait for delay to expire (simulating system running with worker offline)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 4. Start worker after the delay has passed (simulating server/worker restart)
    let processedId = '';
    const worker = createEmailWorker(async (j) => {
      if (j.data.emailId === emailId) {
        processedId = j.data.emailId;
      }
    });
    cleanupWorkers.push(worker);

    // Give worker time to pick up and process matured delayed job
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(processedId).toBe(emailId);
  });
});
