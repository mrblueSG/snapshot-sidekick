import { sleep } from '../helpers/utils';
import { capture } from '@snapshot-labs/snapshot-sentry';
import Cache from './cache';
import { timeQueueProcess } from './metrics';

const queues = new Set<Cache>();
const processingItems = new Map<string, Cache>();

async function processItem(cacheable: Cache) {
  console.log(`[queue] Processing queue item: ${cacheable}`);
  try {
    const end = timeQueueProcess.startTimer({ name: cacheable.constructor.name });
    processingItems.set(cacheable.id, cacheable);
    await cacheable.createCache();
    end();
  } catch (e) {
    capture(e, { id: cacheable.id });
    console.error(`[queue] Error while processing item`, e);
  } finally {
    queues.delete(cacheable);
    processingItems.delete(cacheable.id);
  }
}

export function queue(cacheable: Cache) {
  queues.add(cacheable);

  return queues.size;
}

export function size() {
  return queues.size;
}

export function getProgress(id: string) {
  if (processingItems.has(id)) {
    return processingItems.get(id)?.generationProgress as number;
  }

  return 0;
}

async function run() {
  try {
    console.log(`[queue] Poll queue (found ${queues.size} items)`);
    queues.forEach(async cacheable => {
      if (processingItems.has(cacheable.id)) {
        console.log(
          `[queue] Skip: ${cacheable} is currently being processed, progress: ${processingItems.get(
            cacheable.id
          )?.generationProgress}%`
        );
        return;
      }

      processItem(cacheable);
    });
  } catch (e) {
    capture(e);
  } finally {
    await sleep(15e3);
    await run();
  }
}

run();
