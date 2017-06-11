// @flow
import type { GraphQLSchema } from 'graphql';

import _ from 'lodash';
import graphqlHTTP from 'express-graphql';
import graphqlResolve, { defaultNext, promisifyNext } from 'graphql-resolve';

export type GraphQLLoggerBranch = {
  dur?:number,
  resp?:string,
  err?: {|
    json:string,
    stack:string,
  |},
  args?:Object,
  [string]: GraphQLLoggerBranch,
};

export type GraphQLLoggerTree = {
  query: { [string]: GraphQLLoggerBranch },
  mutation: { [string]: GraphQLLoggerBranch },
};

export default function ({
  schema,
  disableLists=false,
  disableResponseData=false,
  onFinish=(() => {}),
}:{|
  schema:GraphQLSchema,
  disableLists?:boolean,
  disableResponseData?:boolean,
  onFinish:(req:{ graphqlTree:GraphQLLoggerTree }, res:*) => void,
|}) {
  const flattenPath = (path, inverted=[]) => {
    if (path) {
      inverted.push(path.key);
      return flattenPath(path.prev, inverted);
    }
    return inverted;
  };

  const buildTree = (tree, flattenedPath) => {
    if (tree.stop && disableLists) {
      return null;
    }

    const key = flattenedPath.pop();
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

  const intercept = next => (p, a, c, ast) => {
    /* eslint-disable no-param-reassign */
    if (!c.graphqlTree) {
      c.graphqlTree = {};
    }

    if (!c.graphqlRootQueryFields) {
      c.graphqlRootQueryFields = {};
    }

    const path = flattenPath(ast.path);

    /* eslint-disable no-underscore-dangle */
    if (
      String(ast.parentType) === String(
        ast.schema._queryType,
      )
    ) {
      c.graphqlRootQueryFields[_.last(path)] = true;
    }
    /* eslint-enable no-underscore-dangle */
    /* eslint-enable no-param-reassign */

    const branch = buildTree(
      c.graphqlTree,
      path.concat([
        c.graphqlRootQueryFields[_.last(path)] ? 'query' : 'mutation',
      ]),
    );

    if (branch && !_.isEmpty(a)) {
      branch.args = a;
    }

    if (branch && /^\[.*\]$/.test(String(ast.returnType))) {
      branch.stop = true;
    }

    if (branch) {
      const start = Date.now();
      return promisifyNext(next)(p, a, c, ast)
      .then((resp) => {
        branch.dur = Date.now() - start;
        if (!disableResponseData) {
          branch.resp = _.isObject(resp) ?
            JSON.stringify(resp, null, 2) :
            resp;
        }
        return resp;
      })
      .catch((err) => {
        branch.dur = Date.now() - start;
        branch.err = {
          json: JSON.stringify(err, null, 2),
          stack: err.stack,
        };
        return Promise.reject(err);
      });
    }

    return promisifyNext(next)(p, a, c, ast);
  };

  graphqlResolve(schema, (field) => {
    /* eslint-disable no-param-reassign */
    field.resolve = intercept(field.resolve || defaultNext);
    /* eslint-enable no-param-reassign */
  });

  return (req:*, res:*, next:*) => {
    graphqlHTTP.getGraphQLParams(req)
    .then((params) => {
      req.body = params;
      res.on('finish', () => {
        onFinish(req, res);
      });
      next();
    })
    .catch(next);
  };
}
