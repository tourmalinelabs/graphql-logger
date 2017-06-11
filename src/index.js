// @flow
import type { GraphQLSchema } from 'graphql';

import moment from 'moment';
import _ from 'lodash';
import graphqlHTTP from 'express-graphql';
import slugid from 'slugid';
import graphqlResolve, { defaultNext, promisifyNext } from 'graphql-resolve';
import createRabbitmq from './rabbitmq';

export default function ({
  schema,
  connection,
  indexPrefix='logstash',
  indexInterval='weekly',
  disableLists=false,
  disableResponseData=false,
}:{|
  schema:GraphQLSchema,
  connection:*,
  indexPrefix?:string,
  indexInterval?:string,
  disableLists?:boolean,
  disableResponseData?:boolean,
|}) {
  const rabbitmq = createRabbitmq({ connection });

  const generateIndexInterval = () => {
    switch (indexInterval) {
      case 'daily':
        return moment.utc().format('YYYY.MM.DD');
      case 'weekly':
        return moment.utc().format('YYYY.W');
      case 'monthly':
        return moment.utc().format('YYYY.MM');
      default:
        throw new Error(`Invalid indexInterval: ${indexInterval}`);
    }
  };

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
    const logId = slugid.v4();
    const counter = (() => {
      let count = 0;
      return () => {
        count += 1;
        return count;
      };
    })();

    req.logs = [];
    req.addLog = data => req.logs.push(data);

    req.sendLogs = rabbitmq.sendLogs;

    req.flushLogs = () => {
      const mappedLogs = {};

      _.each(req.logs, (log) => {
        if (!mappedLogs[log.type]) {
          mappedLogs[log.type] = _.omit(log, 'type');
        } else {
          mappedLogs[`${log.type}-${counter()}`] = _.omit(log, 'type');
        }
      });

      rabbitmq.sendLogs(_.extend(
        mappedLogs,
        {
          id: logId,
          index: `${indexPrefix}-${generateIndexInterval()}`,
          type: 'graphql-request',
        },
      ));
    };

    graphqlHTTP.getGraphQLParams(req)
    .then((params) => {
      req.body = params;
      const startTime = Date.now();
      res.on('finish', () => {
        const log = {
          type: 'req',
          ip: req.ip,
          query: req.body.query,
          tree: req.graphqlTree,
          user: req.user,
          headers: req.headers,
          dur: Date.now() - startTime,
        };

        if (log.headers && log.headers['content-length']) {
          log.headers['content-length'] = parseInt(
            log.headers['content-length'], 10,
          );
        }

        req.addLog(log);
        req.flushLogs();
      });

      next();
    })
    .catch(next);
  };
}
