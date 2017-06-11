// @flow
import Promise from 'bluebird';
import _ from 'lodash';
import express from 'express';
import expressGraphql from 'express-graphql';
import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLList,
} from 'graphql';
import { mutationWithClientMutationId } from 'graphql-relay';
import graphqlLogger from '../index';

module.exports = (fig:*) => new Promise((resolve) => {
  const app = express();

  const start = () => {
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'RootQueryType',
        fields: {
          unpromised: {
            type: GraphQLString,
            resolve: () => 'unpromised-data',
          },
          promised: {
            type: GraphQLString,
            resolve: () => Promise.resolve('promised-data'),
          },
          nested: {
            type: new GraphQLObjectType({
              name: 'NestedData',
              fields: {
                foo: {
                  type: GraphQLString,
                  resolve: () => 'bar',
                },
              },
            }),
            resolve: () => ({}),
          },
          list: {
            type: new GraphQLList(new GraphQLObjectType({
              name: 'ListObject',
              fields: {
                val: {
                  type: GraphQLString,
                  resolve: p => p,
                },
              },
            })),
            resolve: () => ['a', 'b', 'c'],
          },
          promisedError: {
            type: GraphQLString,
            resolve: () => Promise.reject(new Error('promised-error')),
          },
          thrownError: {
            type: GraphQLString,
            resolve: () => {
              throw new Error('thrown-error');
            },
          },
          withArgs: {
            type: GraphQLString,
            args: {
              foo: { type: GraphQLString },
            },
            resolve: (p, { foo }) => String(foo),
          },
        },
      }),
      mutation: new GraphQLObjectType({
        name: 'RootMutationType',
        fields: {
          doIt: mutationWithClientMutationId({
            name: 'DoIt',
            inputFields: {
              foo: { type: GraphQLString },
            },
            outputFields: {
              bar: { type: GraphQLString },
              nested: {
                type: new GraphQLObjectType({
                  name: 'DoItNested',
                  fields: {
                    a: {
                      type: GraphQLString,
                      resolve: () => 'a',
                    },
                  },
                }),
                resolve: () => ({}),
              },
            },
            mutateAndGetPayload: input => ({ bar: input.foo }),
          }),
        },
      }),
    });

    app.use(graphqlLogger(_.extend(fig, { schema })));

    app.use('/graphql', expressGraphql(() => ({
      schema,
      graphiql: true,
    })));

    global.GRAPHQL_SERVER = app.listen(3000, resolve);
  };

  if (global.GRAPHQL_SERVER) {
    global.GRAPHQL_SERVER.close(() => start());
  } else {
    start();
  }
});
