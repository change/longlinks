const fs = require('fs');
const util = require('util');

const readFile = util.promisify(fs.readFile);

let store;

beforeEach(() => {
  jest.resetModules();
  jest.doMock('../config.json', () => readFile('./test/config.test.json'));
  store = require('../api/store'); // eslint-disable-line global-require
});

test('store.handle is a function', () => {
  expect(store).toHaveProperty('handle');
});
