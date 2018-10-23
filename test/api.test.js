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
        expect(mock.calls[0]).toHaveLength(1);
      } catch (ex) {
        reject(ex);
        return;
      }
      resolve({
        mock,
        arg: mock.calls[0][0],
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

const promiseToStoreUrl = url => promiseToStore(`{"url":"${url}"}`);

const expectPromiseToStoreUrl = url => expect(promiseToStoreUrl(url));

const expectStatusForUrl = (url, status) => expectPromiseToStoreUrl(url).resolves
  .toHaveStatusCode(status);

const expectSuccessfulShortening = async (url) => {
  const promise = promiseToStoreUrl(url);
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
    expect(body.path).toHaveLength(10);
    expect(body.url).toStartWith(testConfig.short_domain);
    expect(body.url).toEndWith(body.path);
    return true;
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
  // Lambda should never send us an unparseable request body, so it's appropriate for this to just
  // throw an error.
  test(
    'is not parseable as JSON, we get an Error object',
    () => expect(promiseToStore('')).rejects.toBeInstanceOf(Error)
  );

  // Whereas this is a legit mistake on the part of the caller
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
    'contains an allowed domain string, but in the path, nice try but still 400',
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
