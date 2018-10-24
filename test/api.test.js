const testConfig = require('./config.test.json');
const { toHaveStatusCode } = require('./helpers/status_code_matcher');

// Define matcher for statusCode in a response
expect.extend({ toHaveStatusCode });

let handleCallbackMock;
let s3putObjectMock;
let store;

// Wrap calls to store.handle in a promise for easier testing
function promiseToStore(body) {
  let timer;
  return new Promise((resolve, reject) => { // eslint-disable-line promise/avoid-new
    function resolveTimer() {
      const { mock } = handleCallbackMock;
      try {
        expect(mock.calls).toHaveLength(1);
        expect(mock.calls[0]).toHaveLength(2);
      } catch (ex) {
        reject(ex);
        return;
      }
      resolve({
        mock,
        arg: mock.calls[0][1],
      });
    }
    try {
      store.handle({ body }, null, (...args) => {
        handleCallbackMock.apply(this, args);
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(resolveTimer, 250);
      });
    } catch (ex) {
      reject(ex);
    }
  });
}

const promiseToStoreUrl = (url, hashLength) => promiseToStore(JSON.stringify({ url, hashLength }));

const promiseToStoreWithHashLength = hashLength => promiseToStoreUrl('http://domain1.com/', hashLength);

const expectPromiseToStoreUrl = url => expect(promiseToStoreUrl(url));

const expectStatusForUrl = (url, status) => expectPromiseToStoreUrl(url).resolves
  .toHaveStatusCode(status);

const expectSuccessfulShortening = async (url, hashLength) => {
  const promise = promiseToStoreUrl(url, hashLength);
  await expect(promise).resolves.toMatchObject({
    arg: {
      headers: { 'Access-Control-Allow-Origin': '*' },
      statusCode: 200,
      body: expect.any(String),
    },
  });
  return promise.then((response) => {
    const body = JSON.parse(response.arg.body);
    expect(body).toMatchObject({
      path: expect.any(String),
      url: expect.any(String),
      message: expect.any(String),
    });
    expect(body.path).toHaveLength(hashLength || 10);
    expect(body.url).toStartWith(testConfig.short_domain);
    expect(body.url).toEndWith(body.path);
    return body;
  });
};

beforeEach(() => {
  jest.resetModules();

  // Make sure we load the test config
  jest.doMock('../config.json', () => testConfig);
  store = require('../api/store');

  // Mock the AWS command(s)
  jest.doMock('aws-sdk', () => ({
    S3: class S3 {
      putObject(...args) {
        return s3putObjectMock.apply(this, args);
      }
    },
  }));
  s3putObjectMock = () => ({ promise: () => Promise.resolve() });

  handleCallbackMock = jest.fn();
});

test('store.handle is a function', () => {
  expect(store).toHaveProperty('handle');
  expect(store.handle).toEqual(expect.any(Function));
});

describe('When the request body', () => {
  test(
    'is not parseable as JSON, we get a 400 response',
    () => expect(promiseToStore('')).resolves.toHaveStatusCode(400)
  );

  test(
    'doesn\'t contain a `url` property, we get a 400 response',
    () => expect(promiseToStore('{"foo":"bar"}')).resolves.toHaveStatusCode(400)
  );
});

describe('When the `url` property', () => {
  test(
    'is not a valid URL, we get a 400 response',
    () => expectStatusForUrl('not a url', 400)
  );

  test(
    'is not an allowed domain, we get a 400 response',
    () => expectStatusForUrl('https://www.evil.com/', 400)
  );

  test(
    'sneakily prefixes an allowed domain to make it another domain',
    () => expectStatusForUrl('https://evildomain1.com', 400)
  );

  test(
    'contains an allowed domain string, but in the path. Nice try but still 400',
    () => expectStatusForUrl('https://www.evil.com/https://www.domain1.com', 400)
  );

  test(
    'is good but S3.putObject promise rejects, we get a 500 response',
    () => {
      s3putObjectMock = () => ({ promise: () => Promise.reject() });
      return expectStatusForUrl('https://domain1.com/', 500);
    }
  );

  test(
    'is a path on an allowed bare domain, succeeds',
    () => expectSuccessfulShortening('https://domain1.com/')
  );

  test(
    'is a path on a subdomain of a bare domain, succeeds',
    () => expectSuccessfulShortening('https://subdomain.domain2.org/')
  );
});

describe('When the `hashLength` property', () => {
  test(
    'is not a number, we get a 400 response',
    () => expect(promiseToStoreWithHashLength('foo')).resolves.toHaveStatusCode(400)
  );

  test(
    'is < 7, we get a 400 response',
    () => expect(promiseToStoreWithHashLength(6)).resolves.toHaveStatusCode(400)
  );

  test(
    'is > 12, we get a 400 response',
    () => expect(promiseToStoreWithHashLength(13)).resolves.toHaveStatusCode(400)
  );

  test(
    'is in range, we get back a hash of the specified length',
    () => expectSuccessfulShortening('http://domain1.com', 12)
      .then(({ path }) => expect(path).toHaveLength(12))
  );

  test(
    'is not specified, we get back a hash of length 10',
    () => expectSuccessfulShortening('http://domain2.org')
      .then(({ path }) => expect(path).toHaveLength(10))
  );
});
