'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (_ref) {
  var schema = _ref.schema,
      _ref$disableLists = _ref.disableLists,
      disableLists = _ref$disableLists === undefined ? false : _ref$disableLists,
      _ref$disableResponseD = _ref.disableResponseData,
      disableResponseData = _ref$disableResponseD === undefined ? false : _ref$disableResponseD,
      _ref$onFinish = _ref.onFinish,
      onFinish = _ref$onFinish === undefined ? function () {} : _ref$onFinish;

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
    _expressGraphql2.default.getGraphQLParams(req).then(function (params) {
      req.body = params;
      res.on('finish', function () {
        onFinish(req, res);
      });
      next();
    }).catch(next);
  };
};

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _expressGraphql = require('express-graphql');

var _expressGraphql2 = _interopRequireDefault(_expressGraphql);

var _graphqlResolve = require('graphql-resolve');

var _graphqlResolve2 = _interopRequireDefault(_graphqlResolve);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }