import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface EmailSearchDocument {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
}

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
  maxRetries: 0,
  requestTimeout: 1000,
});

let isIndexInitialized = false;
let lastFailureTimestamp = 0;
const FAILURE_COOLDOWN_MS = 30000;

function isCircuitOpen(): boolean {
  return Date.now() - lastFailureTimestamp < FAILURE_COOLDOWN_MS;
}

function recordFailure() {
  lastFailureTimestamp = Date.now();
}

export async function initElasticsearchIndex() {
  if (isIndexInitialized) return;
  if (isCircuitOpen()) return;

  try {
    const exists = await esClient.indices.exists({ index: env.ELASTICSEARCH_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: env.ELASTICSEARCH_INDEX,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
          },
        },
      });
      logger.info(`Created Elasticsearch index '${env.ELASTICSEARCH_INDEX}'`);
    }
    isIndexInitialized = true;
  } catch (err) {
    recordFailure();
    logger.warn(`Elasticsearch index initialization skipped or unavailable: ${err instanceof Error ? err.message : err}`);
  }
}

export async function indexEmailDocument(doc: EmailSearchDocument): Promise<boolean> {
  if (isCircuitOpen()) return false;

  try {
    await initElasticsearchIndex();
    await esClient.index({
      index: env.ELASTICSEARCH_INDEX,
      id: doc.id,
      document: doc,
      refresh: env.NODE_ENV === 'test' ? 'wait_for' : false,
    });
    logger.debug(`Indexed email document ${doc.id} in Elasticsearch`);
    return true;
  } catch (err) {
    recordFailure();
    logger.warn(`Elasticsearch indexing failed for email ${doc.id}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function updateEmailDocument(
  id: string,
  partialDoc: Partial<EmailSearchDocument>
): Promise<boolean> {
  if (isCircuitOpen()) return false;

  try {
    await initElasticsearchIndex();
    await esClient.update({
      index: env.ELASTICSEARCH_INDEX,
      id,
      doc: partialDoc,
      refresh: env.NODE_ENV === 'test' ? 'wait_for' : false,
    });
    logger.debug(`Updated email document ${id} in Elasticsearch`);
    return true;
  } catch (err) {
    recordFailure();
    logger.warn(`Elasticsearch doc update failed for email ${id}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function searchEmails(userId: string, query: string): Promise<EmailSearchDocument[]> {
  if (isCircuitOpen()) {
    throw new Error('Elasticsearch circuit breaker is open (offline)');
  }

  try {
    await initElasticsearchIndex();
    const response = await esClient.search<EmailSearchDocument>({
      index: env.ELASTICSEARCH_INDEX,
      query: {
        bool: {
          filter: [{ term: { userId } }],
          must: [
            {
              multi_match: {
                query,
                fields: ['recipient^2', 'subject^2', 'body'],
                fuzziness: 'AUTO',
              },
            },
          ],
        },
      },
    });

    return response.hits.hits.map((hit) => hit._source as EmailSearchDocument);
  } catch (err) {
    recordFailure();
    logger.warn(`Elasticsearch search query failed, using relational fallback: ${err instanceof Error ? err.message : err}`);
    throw err;
  }
}
