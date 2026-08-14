import { Queue } from 'bullmq';

/** Очереди со стороны приложения: кладём задачи, обрабатывает их воркер. */
const connection = { url: process.env.REDIS_URL! };

export const pollQueue = new Queue('poll-agent', { connection });
