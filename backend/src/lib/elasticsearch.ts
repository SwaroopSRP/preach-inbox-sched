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

let authConfig: any = undefined;
if (env.ELASTICSEARCH_API_KEY) {
  authConfig = { apiKey: env.ELASTICSEARCH_API_KEY };
} else if (env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD) {
  authConfig = {
    username: env.ELASTICSEARCH_USERNAME,
    password: env.ELASTICSEARCH_PASSWORD,
  };
}

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
  auth: authConfig,
  maxRetries: 1,
  requestTimeout: 3000,
});

export async function pingElasticsearch(): Promise<{ connected: boolean; latencyMs?: number; version?: string; error?: string }> {
  const start = Date.now();
  try {
    const info = await esClient.info();
    return {
      connected: true,
      latencyMs: Date.now() - start,
      version: info.version.number,
    };
  } catch (err: any) {
    return {
      connected: false,
      error: err.message,
    };
  }
}

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

  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    await initElasticsearchIndex();
    const sanitized = trimmed.replace(/[+\-=!(){}[\]^"~*?:\\/]/g, ' ').trim();
    const response = await esClient.search<EmailSearchDocument>({
      index: env.ELASTICSEARCH_INDEX,
      query: {
        bool: {
          filter: [{ term: { userId } }],
          should: [
            {
              multi_match: {
                query: trimmed,
                fields: ['recipient^3', 'subject^2', 'body'],
                type: 'phrase_prefix',
              },
            },
            {
              multi_match: {
                query: trimmed,
                fields: ['recipient^3', 'subject^2', 'body'],
                fuzziness: 'AUTO',
              },
            },
            ...(sanitized
              ? [
                  {
                    query_string: {
                      query: `*${sanitized}*`,
                      fields: ['recipient^3', 'subject^2', 'body'],
                      default_operator: 'AND' as const,
                      analyze_wildcard: true,
                    },
                  },
                ]
              : []),
          ],
          minimum_should_match: 1,
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

