// npm run seed: a demo admin, two API keys and ~500 request logs over the past 7 days.
const { config } = require('../src/config/env');
const { models } = require('../src/config/models');
const { createModelCatalog } = require('../src/services/modelCatalog');
const { createProviders } = require('../src/providers');
const { connectDatabase, disconnectDatabase } = require('../src/db/mongoose');
const { seedDemo, DEMO_USER } = require('./lib/seedDemo');

async function main() {
  const catalog = createModelCatalog(models, {
    knownProviders: Object.keys(createProviders(config)),
  });
  await connectDatabase(config.mongoUri);

  const { keys, logCount } = await seedDemo({
    models: catalog.list(),
    bcryptRounds: config.bcryptRounds,
  });

  console.log(`\nSeeded ${logCount} request logs over the past 7 days.\n`);
  console.log(`Sign in to the dashboard as ${DEMO_USER.email} / ${DEMO_USER.password}\n`);
  console.log('API keys (shown once, like in the dashboard):');
  for (const key of keys) console.log(`  ${key.name.padEnd(16)} ${key.secret}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
