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
    onFinish: ({ graphqlTree }) => {
      logsSpy(graphqlTree);
    },
    disableLists: false,
    disableResponseData: false,
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
        const tree = logsSpy.args[0][0];
        // console.log(JSON.stringify(tree, null, 2))
        expect(typeof tree.query.list['0'].val.dur).to.equal('number');
        expect(tree.query).to.have.all.keys(
          'unpromised',
          'promised',
          'nested',
          'list',
          'promisedError',
          'thrownError',
          'withArgs',
        );
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
      const tree = logsSpy.args[0][0];
      expect(tree.mutation).to.have.all.keys('doIt');
      expect(typeof tree.mutation.doIt.dur).to.equal('number');
    }),
  );

  it(
    'should log args',
    () => startServer()
    .then(() => graphqlRequest('{ withArgs(foo:"bar") }'))
    .then(({ errors }) => {
      expect(errors).to.be.undefined;
      const tree = logsSpy.args[0][0];
      expect(tree.query.withArgs.args)
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
      const tree = logsSpy.args[0][0];
      expect(tree.query.promisedError.err)
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
      const tree = logsSpy.args[0][0];
      expect(tree.query.thrownError.err)
      .to.have.all.keys('json', 'stack');
    }),
  );

  it(
    'should have option to disableLists',
    () => startServer({ disableLists: true })
    .then(() => graphqlRequest('{ list { val } }'))
    .then(({ errors }) => {
      expect(errors).to.be.undefined;
      const tree = logsSpy.args[0][0];
      expect(tree.query.list['0']).to.be.undefined;
    }),
  );
});
