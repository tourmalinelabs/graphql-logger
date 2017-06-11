'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (_ref) {
  var schema = _ref.schema,
      connection = _ref.connection,
      _ref$indexPrefix = _ref.indexPrefix,
      indexPrefix = _ref$indexPrefix === undefined ? 'logstash' : _ref$indexPrefix,
      _ref$indexInterval = _ref.indexInterval,
      indexInterval = _ref$indexInterval === undefined ? 'weekly' : _ref$indexInterval,
      _ref$disableLists = _ref.disableLists,
      disableLists = _ref$disableLists === undefined ? false : _ref$disableLists,
      _ref$disableResponseD = _ref.disableResponseData,
      disableResponseData = _ref$disableResponseD === undefined ? false : _ref$disableResponseD;

  var rabbitmq = (0, _rabbitmq2.default)({ connection: connection });

  var generateIndexInterval = function generateIndexInterval() {
    switch (indexInterval) {
      case 'daily':
        return _moment2.default.utc().format('YYYY.MM.DD');
      case 'weekly':
        return _moment2.default.utc().format('YYYY.W');
      case 'monthly':
        return _moment2.default.utc().format('YYYY.MM');
      default:
        throw new Error('Invalid indexInterval: ' + indexInterval);
    }
  };

  var flattenPath = function flattenPath(path) {
    var inverted = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

    if (path) {
      inverted.push(path.key);
      return flattenPath(path.prev, inverted);
    }
    return inverted;
  };

  var buildTree = function buildTree(tree, flattenedPath) {
    if (tree.stop && disableLists) {
      return null;
    }

    var key = flattenedPath.pop();
    if (key !== undefined) {
      if (!tree[key]) {
        /* eslint-disable no-param-reassign */
        tree[key] = {};
        /* eslint-enable no-param-reassign */
      }
      return buildTree(tree[key], flattenedPath);
    }

    return tree;
  };

  var intercept = function intercept(next) {
    return function (p, a, c, ast) {
      /* eslint-disable no-param-reassign */
      if (!c.graphqlTree) {
        c.graphqlTree = {};
      }

      if (!c.graphqlRootQueryFields) {
        c.graphqlRootQueryFields = {};
      }

      var path = flattenPath(ast.path);

      /* eslint-disable no-underscore-dangle */
      if (String(ast.parentType) === String(ast.schema._queryType)) {
        c.graphqlRootQueryFields[_lodash2.default.last(path)] = true;
      }
      /* eslint-enable no-underscore-dangle */
      /* eslint-enable no-param-reassign */

      var branch = buildTree(c.graphqlTree, path.concat([c.graphqlRootQueryFields[_lodash2.default.last(path)] ? 'query' : 'mutation']));

      if (branch && !_lodash2.default.isEmpty(a)) {
        branch.args = a;
      }

      if (branch && /^\[.*\]$/.test(String(ast.returnType))) {
        branch.stop = true;
      }

      if (branch) {
        var start = Date.now();
        return (0, _graphqlResolve.promisifyNext)(next)(p, a, c, ast).then(function (resp) {
          branch.dur = Date.now() - start;
          if (!disableResponseData) {
            branch.resp = _lodash2.default.isObject(resp) ? JSON.stringify(resp, null, 2) : resp;
          }
          return resp;
        }).catch(function (err) {
          branch.dur = Date.now() - start;
          branch.err = {
            json: JSON.stringify(err, null, 2),
            stack: err.stack
          };
          return Promise.reject(err);
        });
      }

      return (0, _graphqlResolve.promisifyNext)(next)(p, a, c, ast);
    };
  };

  (0, _graphqlResolve2.default)(schema, function (field) {
    /* eslint-disable no-param-reassign */
    field.resolve = intercept(field.resolve || _graphqlResolve.defaultNext);
    /* eslint-enable no-param-reassign */
  });

  return function (req, res, next) {
    var logId = _slugid2.default.v4();
    var counter = function () {
      var count = 0;
      return function () {
        count += 1;
        return count;
      };
    }();

    req.logs = [];
    req.addLog = function (data) {
      return req.logs.push(data);
    };

    req.sendLogs = rabbitmq.sendLogs;

    req.flushLogs = function () {
      var mappedLogs = {};

      _lodash2.default.each(req.logs, function (log) {
        if (!mappedLogs[log.type]) {
          mappedLogs[log.type] = _lodash2.default.omit(log, 'type');
        } else {
          mappedLogs[log.type + '-' + counter()] = _lodash2.default.omit(log, 'type');
        }
      });

      rabbitmq.sendLogs(_lodash2.default.extend(mappedLogs, {
        id: logId,
        index: indexPrefix + '-' + generateIndexInterval(),
        type: 'graphql-request'
      }));
    };

    _expressGraphql2.default.getGraphQLParams(req).then(function (params) {
      req.body = params;
      var startTime = Date.now();
      res.on('finish', function () {
        var log = {
          type: 'req',
          ip: req.ip,
          query: req.body.query,
          tree: req.graphqlTree,
          user: req.user,
          headers: req.headers,
          dur: Date.now() - startTime
        };

        if (log.headers && log.headers['content-length']) {
          log.headers['content-length'] = parseInt(log.headers['content-length'], 10);
        }

        req.addLog(log);
        req.flushLogs();
      });

      next();
    }).catch(next);
  };
};

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _expressGraphql = require('express-graphql');

var _expressGraphql2 = _interopRequireDefault(_expressGraphql);

var _slugid = require('slugid');

var _slugid2 = _interopRequireDefault(_slugid);

var _graphqlResolve = require('graphql-resolve');

var _graphqlResolve2 = _interopRequireDefault(_graphqlResolve);

var _rabbitmq = require('./rabbitmq');

var _rabbitmq2 = _interopRequireDefault(_rabbitmq);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }