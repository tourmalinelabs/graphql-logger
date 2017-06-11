'use strict';

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _expressGraphql = require('express-graphql');

var _expressGraphql2 = _interopRequireDefault(_expressGraphql);

var _graphql = require('graphql');

var _graphqlRelay = require('graphql-relay');

var _index = require('../index');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

module.exports = function (fig) {
  return new _bluebird2.default(function (resolve) {
    var app = (0, _express2.default)();

    var start = function start() {
      var schema = new _graphql.GraphQLSchema({
        query: new _graphql.GraphQLObjectType({
          name: 'RootQueryType',
          fields: {
            unpromised: {
              type: _graphql.GraphQLString,
              resolve: function resolve() {
                return 'unpromised-data';
              }
            },
            promised: {
              type: _graphql.GraphQLString,
              resolve: function resolve() {
                return _bluebird2.default.resolve('promised-data');
              }
            },
            nested: {
              type: new _graphql.GraphQLObjectType({
                name: 'NestedData',
                fields: {
                  foo: {
                    type: _graphql.GraphQLString,
                    resolve: function resolve() {
                      return 'bar';
                    }
                  }
                }
              }),
              resolve: function resolve() {
                return {};
              }
            },
            list: {
              type: new _graphql.GraphQLList(new _graphql.GraphQLObjectType({
                name: 'ListObject',
                fields: {
                  val: {
                    type: _graphql.GraphQLString,
                    resolve: function resolve(p) {
                      return p;
                    }
                  }
                }
              })),
              resolve: function resolve() {
                return ['a', 'b', 'c'];
              }
            },
            promisedError: {
              type: _graphql.GraphQLString,
              resolve: function resolve() {
                return _bluebird2.default.reject(new Error('promised-error'));
              }
            },
            thrownError: {
              type: _graphql.GraphQLString,
              resolve: function resolve() {
                throw new Error('thrown-error');
              }
            },
            withArgs: {
              type: _graphql.GraphQLString,
              args: {
                foo: { type: _graphql.GraphQLString }
              },
              resolve: function resolve(p, _ref) {
                var foo = _ref.foo;
                return String(foo);
              }
            }
          }
        }),
        mutation: new _graphql.GraphQLObjectType({
          name: 'RootMutationType',
          fields: {
            doIt: (0, _graphqlRelay.mutationWithClientMutationId)({
              name: 'DoIt',
              inputFields: {
                foo: { type: _graphql.GraphQLString }
              },
              outputFields: {
                bar: { type: _graphql.GraphQLString },
                nested: {
                  type: new _graphql.GraphQLObjectType({
                    name: 'DoItNested',
                    fields: {
                      a: {
                        type: _graphql.GraphQLString,
                        resolve: function resolve() {
                          return 'a';
                        }
                      }
                    }
                  }),
                  resolve: function resolve() {
                    return {};
                  }
                }
              },
              mutateAndGetPayload: function mutateAndGetPayload(input) {
                return { bar: input.foo };
              }
            })
          }
        })
      });

      app.use((0, _index2.default)(_lodash2.default.extend(fig, { schema: schema })));

      app.use('/graphql', (0, _expressGraphql2.default)(function () {
        return {
          schema: schema,
          graphiql: true
        };
      }));

      global.GRAPHQL_SERVER = app.listen(3000, resolve);
    };

    if (global.GRAPHQL_SERVER) {
      global.GRAPHQL_SERVER.close(function () {
        return start();
      });
    } else {
      start();
    }
  });
};