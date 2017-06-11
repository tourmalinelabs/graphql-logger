// @flow
const Promise = require('bluebird');

module.exports = ({ connection }:*):* => {
  const self = {};

  const exchange = connection.exchange(
    'logstash',
    {
      type: 'topic',
      autoDelete: false,
      durable: true,
      confirm: true,
    },
    () => {
      const queue = connection.queue(
        'logstash',
        { autoDelete: false, durable: true },
        () => {
          queue.bind(exchange, 'logstash');
        },
      );
    },
  );

  self.sendLogs = logs => new Promise((resolve, reject) => {
    exchange.publish(
      'logstash', logs, {},
      err => (err ? reject(err) : resolve()),
    );
  });

  return self;
};
