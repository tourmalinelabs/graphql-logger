// @flow
/* eslint-disable no-unused-expressions */
const Promise = require('bluebird');
const _ = require('lodash');
const request:any = Promise.promisifyAll(require('request'));
const { expect } = require('chai');
const graphqlServer = require('./server');
const sinon = require('sinon');

const graphqlRequest = (query:string, variables:?Object) => request.postAsync({
  url: 'http://localhost:3000/graphql',
  json: true,
  body: { query, variables: variables && JSON.stringify(variables) },
})
.then(({ body }) => body);

describe('graphql-logger', () => {
  let logsSpy;
  const startServer = (fig={}) => graphqlServer(_.extend({
    connection: {
      exchange: (name, opt, cb) => {
        setTimeout(cb);
        return {
          publish: (n, logs) => logsSpy(logs),
        };
      },
      queue: (name, opt, cb) => {
        setTimeout(cb);
        return { bind: () => {} };
      },
    },
    indexPrefix: 'my-index',
    indexInterval: 'weekly',
    disableLists: false,
  }, fig));

  beforeEach(() => {
    logsSpy = sinon.spy();
  });

  it(
    'should log requests',
    () => {
      const query = `{
        unpromised
        promised
        nested { foo }
        list { val }
        promisedError
        thrownError
        withArgs(foo:"bar")
      }`;
      return startServer()
      .then(() => graphqlRequest(query))
      .then(({ data, errors }) => {
        expect(errors).to.deep.equal([
          {
            message: 'promised-error',
            locations: [{ line: 6, column: 9 }],
            path: ['promisedError'],
          },
          {
            message: 'thrown-error',
            locations: [{ line: 7, column: 9 }],
            path: ['thrownError'],
          },
        ]);
        expect(data).to.deep.equal({
          promised: 'promised-data',
          unpromised: 'unpromised-data',
          withArgs: 'bar',
          nested: { foo: 'bar' },
          list: [{ val: 'a' }, { val: 'b' }, { val: 'c' }],
          promisedError: null,
          thrownError: null,
        });
        const logs = logsSpy.args[0][0];
        // console.log(JSON.stringify(logs.req.tree, null, 2))
        expect(_.extend(
          _.omit(logs, 'index', 'id'),
          { req: _.omit(logs.req, 'dur', 'tree') },
        ))
        .to.deep.equal({
          req: {
            ip: '::ffff:127.0.0.1',
            query,
            headers: {
              host: 'localhost:3000',
              accept: 'application/json',
              'content-type': 'application/json',
              'content-length': 181,
              connection: 'close',
            },
            user: undefined,
          },
          type: 'graphql-request',
        });
        expect(typeof logs.req.dur).to.equal('number');
        expect(typeof logs.req.tree.query.list['0'].val.dur).to.equal('number');
        expect(logs.req.dur).to.be.within(1, 100);
        expect(logs.index).to.match(/^my-index-[0-9]{4}\.[0-9]{2}$/);
        expect(typeof logs.id).to.equal('string');
        expect(logs.id.length).to.be.greaterThan(20);
      });
    },
  );

  it(
    'should log mutation',
    () => startServer()
    .then(() => graphqlRequest(`
      mutation DoIt($input: DoItInput!) {
        doIt(input: $input) {
          bar nested { a }
        }
      }`,
      { input: { foo: 'baz' } },
    ))
    .then(({ errors, data }) => {
      expect(errors).to.be.undefined;
      expect(data).to.deep.equal({
        doIt: {
          bar: 'baz',
          nested: { a: 'a' },
        },
      });
    }),
  );

  it(
    'should log args',
    () => startServer()
    .then(() => graphqlRequest('{ withArgs(foo:"bar") }'))
    .then(({ errors }) => {
      expect(errors).to.be.undefined;
      expect(logsSpy.args[0][0].req.tree.query.withArgs.args)
      .to.deep.equal({ foo: 'bar' });
    }),
  );

  it(
    'should log promised error',
    () => startServer()
    .then(() => graphqlRequest('{ promisedError }'))
    .then(({ errors }) => {
      expect(errors).to.deep.equal([
        {
          message: 'promised-error',
          locations: [{ line: 1, column: 3 }],
          path: ['promisedError'],
        },
      ]);
      expect(logsSpy.args[0][0].req.tree.query.promisedError.err)
      .to.have.all.keys('json', 'stack');
    }),
  );

  it(
    'should log thrown error',
    () => startServer()
    .then(() => graphqlRequest('{ thrownError }'))
    .then(({ errors }) => {
      expect(errors).to.deep.equal([
        {
          message: 'thrown-error',
          locations: [{ line: 1, column: 3 }],
          path: ['thrownError'],
        },
      ]);
      expect(logsSpy.args[0][0].req.tree.query.thrownError.err)
      .to.have.all.keys('json', 'stack');
    }),
  );

  it(
    'should have option to disableLists',
    () => startServer({ disableLists: true })
    .then(() => graphqlRequest('{ list { val } }'))
    .then(({ errors }) => {
      expect(errors).to.be.undefined;
      expect(logsSpy.args[0][0].req.tree.query.list['0']).to.be.undefined;
    }),
  );

  it(
    'should have option to change indexInterval',
    () => startServer({ indexInterval: 'daily' })
    .then(() => graphqlRequest('{ unpromised }'))
    .then(() => {
      expect(logsSpy.args[0][0].index)
      .to.match(/[\d]{4}\.[\d]{2}\.[\d]{2}$/);
    }),
  );
});
