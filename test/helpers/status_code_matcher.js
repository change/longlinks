const { get } = require('lodash');

module.exports.toHaveStatusCode = (received, expected) => {
  const receivedStatusCode = Number(get(received, 'arg.statusCode'));
  const expectedStatusCode = Number(expected);
  const pass = receivedStatusCode && (receivedStatusCode === expectedStatusCode);
  const debuggingHelp = pass ? '' : `\n\n${JSON.stringify(received.arg)}`;
  const message = () => (
    `Expected statusCode of ${expectedStatusCode}, received ${receivedStatusCode}${debuggingHelp}`
  );
  return { pass, message, actual: received };
};
