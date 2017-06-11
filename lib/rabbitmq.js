'use strict';

var Promise = require('bluebird');

module.exports = function (_ref) {
  var connection = _ref.connection;

  var self = {};

  var exchange = connection.exchange('logstash', {
    type: 'topic',
    autoDelete: false,
    durable: true,
    confirm: true
  }, function () {
    var queue = connection.queue('logstash', { autoDelete: false, durable: true }, function () {
      queue.bind(exchange, 'logstash');
    });
  });

  self.sendLogs = function (logs) {
    return new Promise(function (resolve, reject) {
      exchange.publish('logstash', logs, {}, function (err) {
        return err ? reject(err) : resolve();
      });
    });
  };

  return self;
};