const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXECUTION_QUEUE = process.env.EXECUTION_QUEUE || 'execution.queue';

let connectionPromise;
let channelPromise;

async function getChannel() {
  if (!connectionPromise) {
    connectionPromise = amqp.connect(RABBITMQ_URL);
  }

  if (!channelPromise) {
    channelPromise = connectionPromise.then((conn) => conn.createChannel());
  }

  const channel = await channelPromise;
  await channel.assertQueue(EXECUTION_QUEUE, { durable: true });
  return channel;
}

async function publishExecutionJob(payload) {
  const channel = await getChannel();
  channel.sendToQueue(EXECUTION_QUEUE, Buffer.from(JSON.stringify(payload)), {
    persistent: true
  });
}

module.exports = {
  EXECUTION_QUEUE,
  publishExecutionJob
};
