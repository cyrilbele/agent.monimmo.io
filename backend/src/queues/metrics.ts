import type { AiQueueKey } from "./types";

type QueueCounter = {
  started: number;
  completed: number;
  failed: number;
};

export type QueueMetricsSnapshot = Record<AiQueueKey, QueueCounter>;

const createEmptySnapshot = (): QueueMetricsSnapshot => ({
  processMessage: { started: 0, completed: 0, failed: 0 },
  processFile: { started: 0, completed: 0, failed: 0 },
  transcribeVocal: { started: 0, completed: 0, failed: 0 },
  extractVocalInsights: { started: 0, completed: 0, failed: 0 },
});

let queueMetrics: QueueMetricsSnapshot = createEmptySnapshot();

export const resetQueueMetrics = () => {
  queueMetrics = createEmptySnapshot();
};

export const getQueueMetrics = (): QueueMetricsSnapshot =>
  JSON.parse(JSON.stringify(queueMetrics)) as QueueMetricsSnapshot;

export const recordQueueJobStarted = (queue: AiQueueKey) => {
  queueMetrics[queue].started += 1;
};

export const recordQueueJobCompleted = (queue: AiQueueKey) => {
  queueMetrics[queue].completed += 1;
};

export const recordQueueJobFailed = (queue: AiQueueKey) => {
  queueMetrics[queue].failed += 1;
};
