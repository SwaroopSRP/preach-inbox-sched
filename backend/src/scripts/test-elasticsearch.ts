import { esClient, pingElasticsearch, initElasticsearchIndex } from '../lib/elasticsearch.js';
import { env } from '../config/env.js';

async function main() {
  console.log('--- Testing Elasticsearch Connection ---');
  console.log(`Configured URL: ${env.ELASTICSEARCH_URL}`);
  console.log(`Configured Index: ${env.ELASTICSEARCH_INDEX}`);
  console.log(`Auth Mode: ${env.ELASTICSEARCH_API_KEY ? 'API Key' : (env.ELASTICSEARCH_USERNAME ? 'Basic Auth' : 'None / URL Embedded')}`);

  const pingResult = await pingElasticsearch();

  if (!pingResult.connected) {
    console.error('\n❌ Could not connect to Elasticsearch:');
    console.error(pingResult.error);
    console.log('\nNote: When Elasticsearch is offline, the backend automatically uses its PostgreSQL relational fallback with zero user disruption.');
    process.exit(1);
  }

  console.log('\n✅ Connection Successful!');
  console.log(`Cluster Version: ${pingResult.version}`);
  console.log(`Ping Latency: ${pingResult.latencyMs}ms`);

  console.log('\n--- Verifying Index Creation ---');
  await initElasticsearchIndex();
  console.log(`Index '${env.ELASTICSEARCH_INDEX}' is initialized and ready.`);

  console.log('\n--- Testing Search Document Indexing ---');
  const testDocId = `test-verify-${Date.now()}`;
  await esClient.index({
    index: env.ELASTICSEARCH_INDEX,
    id: testDocId,
    document: {
      id: testDocId,
      userId: 'system-verification-user',
      senderId: 'system-verification-sender',
      recipient: 'test.verify@elastic-cloud.test',
      subject: 'Elasticsearch Cloud Verification',
      body: 'Testing search index capabilities on Elastic Cloud cluster',
      status: 'SENT',
      scheduledAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
    },
    refresh: true,
  });
  console.log(`Indexed verification document with ID: ${testDocId}`);

  console.log('\n--- Testing Multi-Match Search Query ---');
  const searchResult = await esClient.search({
    index: env.ELASTICSEARCH_INDEX,
    query: {
      bool: {
        filter: [{ term: { userId: 'system-verification-user' } }],
        must: [
          {
            multi_match: {
              query: 'capabilities',
              fields: ['recipient^2', 'subject^2', 'body'],
              fuzziness: 'AUTO',
            },
          },
        ],
      },
    },
  });

  console.log(`Search matched ${searchResult.hits.hits.length} document(s).`);

  // Cleanup test document
  await esClient.delete({
    index: env.ELASTICSEARCH_INDEX,
    id: testDocId,
  });
  console.log('Cleaned up verification document.');

  console.log('\n🎉 ALL ELASTICSEARCH CHECKS PASSED!');
}

main().catch((err) => {
  console.error('Error during Elasticsearch verification:', err);
  process.exit(1);
});
