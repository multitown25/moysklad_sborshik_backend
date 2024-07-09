// const amqp = require('amqplib');
//
// const orderQueue = 'order_queue';
//
// let channel, connection;
// // need to close channel and connection?
// // await channel.close();
// // await connection.close();
//
// (async () => {
//     connection = await amqp.connect('amqp://localhost');
//     channel = await connection.createChannel();
//
//     await channel.assertQueue(orderQueue, {durable: false}); // очередь не будет сохраняться после перезагрузки RabbitMQ => сделать durable: true? |test|
//
//     channel.prefetch(1);
//
//     await channel.consume(orderQueue, (message) => {
//
//         const response = fib(n);
//         channel.sendToQueue(message.properties.replyTo, Buffer.from(response.toString()), {
//             correlationId: message.properties.correlationId
//         });
//         channel.ack(message);
//     });
// })();
//
//
// module.exports = {
//     channel,
//     connection
// }