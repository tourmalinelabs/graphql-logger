'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/* eslint-disable no-unused-expressions */
var Promise = require('bluebird');
var _ = require('lodash');
var request = Promise.promisifyAll(require('request'));

var _require = require('chai'),
    expect = _require.expect;

var graphqlServer = require('./server');
var sinon = require('sinon');

var graphqlRequest = function graphqlRequest(query, variables) {
  return request.postAsync({
    url: 'http://localhost:3000/graphql',
    json: true,
    body: { query: query, variables: variables && JSON.stringify(variables) }
  }).then(function (_ref) {
    var body = _ref.body;
    return body;
  });
};

describe('log-graphql', function () {
  var logsSpy = void 0;
  var startServer = function startServer() {
    var fig = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return graphqlServer(_.extend({
      connection: {
        exchange: function exchange(name, opt, cb) {
          setTimeout(cb);
          return {
            publish: function publish(n, logs) {
              return logsSpy(logs);
            }
          };
        },
        queue: function queue(name, opt, cb) {
          setTimeout(cb);
          return { bind: function bind() {} };
        }
      },
      indexPrefix: 'my-index',
      indexInterval: 'weekly',
      disableLists: false
    }, fig));
  };

  beforeEach(function () {
    logsSpy = sinon.spy();
  });

  it('should log requests', function () {
    var query = '{\n        unpromised\n        promised\n        nested { foo }\n        list { val }\n        promisedError\n        thrownError\n        withArgs(foo:"bar")\n      }';
    return startServer().then(function () {
      return graphqlRequest(query);
    }).then(function (_ref2) {
      var data = _ref2.data,
          errors = _ref2.errors;

      expect(errors).to.be.undefined;
      expect(data).to.deep.equal({
        promised: 'promised-data',
        unpromised: 'unpromised-data',
        withArgs: 'bar',
        nested: { foo: 'bar' },
        list: [{ val: 'a' }, { val: 'b' }, { val: 'c' }],
        promisedError: null,
        thrownError: null
      });
      var logs = logsSpy.args[0][0];
      // console.log(JSON.stringify(logs.req.tree, null, 2))
      expect(_.extend(_.omit(logs, 'index', 'id'), { req: _.omit(logs.req, 'dur', 'tree') })).to.deep.equal({
        req: {
          ip: '::ffff:127.0.0.1',
          query: query,
          headers: {
            host: 'localhost:3000',
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': 181,
            connection: 'close'
          },
          user: undefined
        },
        type: 'graphql-request'
      });
      expect(_typeof(logs.req.dur)).to.equal('number');
      expect(_typeof(logs.req.tree.query.list['0'].val.dur)).to.equal('number');
      expect(logs.req.dur).to.be.within(1, 100);
      expect(logs.index).to.match(/^my-index-[0-9]{4}\.[0-9]{2}$/);
      expect(_typeof(logs.id)).to.equal('string');
      expect(logs.id.length).to.be.greaterThan(20);
    });
  });

  it('should log mutation', function () {
    return startServer().then(function () {
      return graphqlRequest('\n      mutation DoIt($input: DoItInput!) {\n        doIt(input: $input) {\n          bar nested { a }\n        }\n      }', { input: { foo: 'baz' } });
    }).then(function (_ref3) {
      var errors = _ref3.errors,
          data = _ref3.data;

      expect(errors).to.be.undefined;
      expect(data).to.deep.equal({
        doIt: {
          bar: 'baz',
          nested: { a: 'a' }
        }
      });
    });
  });

  it('should log args', function () {
    return startServer().then(function () {
      return graphqlRequest('{ withArgs(foo:"bar") }');
    }).then(function (_ref4) {
      var errors = _ref4.errors;

      expect(errors).to.be.undefined;
      expect(logsSpy.args[0][0].req.tree.query.withArgs.args).to.deep.equal({ foo: 'bar' });
    });
  });

  it('should log promised error', function () {
    return startServer().then(function () {
      return graphqlRequest('{ promisedError }');
    }).then(function (_ref5) {
      var errors = _ref5.errors;

      expect(errors).to.be.undefined;
      expect(logsSpy.args[0][0].req.tree.query.promisedError.err).to.have.all.keys('json', 'stack');
    });
  });

  it('should log thrown error', function () {
    return startServer().then(function () {
      return graphqlRequest('{ thrownError }');
    }).then(function (_ref6) {
      var errors = _ref6.errors;

      expect(errors).to.be.undefined;
      expect(logsSpy.args[0][0].req.tree.query.thrownError.err).to.have.all.keys('json', 'stack');
    });
  });

  it('should have option to disableLists', function () {
    return startServer({ disableLists: true }).then(function () {
      return graphqlRequest('{ list { val } }');
    }).then(function (_ref7) {
      var errors = _ref7.errors;

      expect(errors).to.be.undefined;
      expect(logsSpy.args[0][0].req.tree.query.list['0']).to.be.undefined;
    });
  });

  it('should have option to change indexInterval', function () {
    return startServer({ indexInterval: 'daily' }).then(function () {
      return graphqlRequest('{ unpromised }');
    }).then(function (_ref8) {
      var errors = _ref8.errors;

      expect(errors).to.be.undefined;
      expect(logsSpy.args[0][0].index).to.match(/[\d]{4}\.[\d]{2}\.[\d]{2}$/);
    });
  });
});