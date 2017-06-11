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

describe('graphql-logger', function () {
  var logsSpy = void 0;
  var startServer = function startServer() {
    var fig = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return graphqlServer(_.extend({
      onFinish: function onFinish(req) {
        return logsSpy(req.graphqlTree);
      },
      disableLists: false,
      disableResponseData: false
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

      expect(errors).to.deep.equal([{
        message: 'promised-error',
        locations: [{ line: 6, column: 9 }],
        path: ['promisedError']
      }, {
        message: 'thrown-error',
        locations: [{ line: 7, column: 9 }],
        path: ['thrownError']
      }]);
      expect(data).to.deep.equal({
        promised: 'promised-data',
        unpromised: 'unpromised-data',
        withArgs: 'bar',
        nested: { foo: 'bar' },
        list: [{ val: 'a' }, { val: 'b' }, { val: 'c' }],
        promisedError: null,
        thrownError: null
      });
      var tree = logsSpy.args[0][0];
      expect(_typeof(tree.query.list['0'].val.dur)).to.equal('number');
      expect(tree.query).to.have.all.keys('unpromised', 'promised', 'nested', 'list', 'promisedError', 'thrownError', 'withArgs');
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
      var tree = logsSpy.args[0][0];
      expect(tree.mutation).to.have.all.keys('doIt');
      expect(_typeof(tree.mutation.doIt.dur)).to.equal('number');
    });
  });

  it('should log args', function () {
    return startServer().then(function () {
      return graphqlRequest('{ withArgs(foo:"bar") }');
    }).then(function (_ref4) {
      var errors = _ref4.errors;

      expect(errors).to.be.undefined;
      var tree = logsSpy.args[0][0];
      expect(tree.query.withArgs.args).to.deep.equal({ foo: 'bar' });
    });
  });

  it('should log promised error', function () {
    return startServer().then(function () {
      return graphqlRequest('{ promisedError }');
    }).then(function (_ref5) {
      var errors = _ref5.errors;

      expect(errors).to.deep.equal([{
        message: 'promised-error',
        locations: [{ line: 1, column: 3 }],
        path: ['promisedError']
      }]);
      var tree = logsSpy.args[0][0];
      expect(tree.query.promisedError.err).to.have.all.keys('json', 'stack');
    });
  });

  it('should log thrown error', function () {
    return startServer().then(function () {
      return graphqlRequest('{ thrownError }');
    }).then(function (_ref6) {
      var errors = _ref6.errors;

      expect(errors).to.deep.equal([{
        message: 'thrown-error',
        locations: [{ line: 1, column: 3 }],
        path: ['thrownError']
      }]);
      var tree = logsSpy.args[0][0];
      expect(tree.query.thrownError.err).to.have.all.keys('json', 'stack');
    });
  });

  it('should have option to disableLists', function () {
    return startServer({ disableLists: true }).then(function () {
      return graphqlRequest('{ list { val } }');
    }).then(function (_ref7) {
      var errors = _ref7.errors;

      expect(errors).to.be.undefined;
      var tree = logsSpy.args[0][0];
      expect(tree.query.list['0']).to.be.undefined;
    });
  });
});