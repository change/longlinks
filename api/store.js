const endsWith = require('lodash.endswith');
const find = require('lodash.find');

// Since this is always included implicitly by Lambda, we include it as a devDependency in order to
// avoid the unnessary bloating of the .zip bundle.
const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies

const { BigInteger } = require('jsbn');
const fnv = require('fnv-plus');
const url = require('url');

const {
  bucket,
  debug,
  domain_safe_list: domainSafeList,
  short_domain: shortDomain,
} = require('../config.json'); // eslint-disable-line import/no-unresolved

// Vowels, l, 0, 1, 3 removed mostly to prevent hash forming bad words. The letter 'l' removed to
// avoid ambiguity if user has to manually transcribe short hash.
const base48HashChars = '2456789bcdfghjkmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ';

const S3 = new AWS.S3();

const debugLog = (...args) => {
  // This will output to the CloudWatch log group for this lambda function
  if (debug) {
    console.log(...args); // eslint-disable-line no-console
  }
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function validate(longUrl) {
  let host;
  debugLog(`validating longUrl ${longUrl}`);
  try {
    ({ host } = url.parse(longUrl));
  } catch (ex) {
    throw new HttpError(400, 'Not a valid URL');
  }
  const suffixMatcher = suffix => suffix === host || endsWith(host, `.${suffix}`);
  if (!find(domainSafeList, suffixMatcher)) {
    throw new HttpError(400, `Not an allowed domain for shortening: ${host}`);
  }
  return longUrl;
}

// input is BigInteger Number
function base48encode(input, maxLength) {
  const base = new BigInteger(base48HashChars.length.toString());
  let workingValue = input.clone();
  let result = '';

  do {
    const [quotient, remainder] = workingValue.divideAndRemainder(base);
    result = base48HashChars.charAt(remainder.intValue()) + result;
    workingValue = quotient;
  }
  while (workingValue.compareTo(BigInteger.ZERO) > 0 && result.length < maxLength);

  return result;
}

// Hash algorithm
// 1 - take 64 bit FNV hash of string
// 2 - hash again the 'to string' of the first hash (base-10 text)
// 3 - keep the last `hashLength` digits of (2) base 48 encoded
function calculateHash(hashLength = 10) {
  const min = 7;
  const max = 12;
  return (longUrl) => {
    if (!Number(hashLength) || hashLength < min || hashLength > max) {
      throw new HttpError(400, `'hashLength' must be a value in the range [${min}, ${max}]`);
    }
    // double hash to improve mixing where only small changes are made to input
    const hashValue = fnv.hash(longUrl, 64).value;
    const hashValueTwice = fnv.hash(hashValue.toString(), 64).value;
    return {
      longUrl,
      hash: base48encode(hashValueTwice, hashLength),
    };
  };
}

async function createS3Object({ longUrl, hash }) {
  debugLog(`createS3Object ${hash} => ${longUrl}`);
  await S3.putObject({ Bucket: bucket, Key: hash, WebsiteRedirectLocation: longUrl }).promise();
  return hash;
}

function buildResponse(statusCode, { message, path }) {
  const body = { message, path };

  if (path) {
    body.url = `${shortDomain}/${path}`;
  }
  debugLog(`buildResponse() code=${statusCode} body.url=${body.url}`);

  return {
    headers: { 'Access-Control-Allow-Origin': '*' },
    statusCode,
    body: JSON.stringify(body),
  };
}

function handleError(err = {}) {
  const code = err.statusCode || 500;
  const message = err.message || err.stack || String(err);
  debugLog(`handleError code=${code} message=${message}`);
  return buildResponse(code, { message });
}

module.exports.handle = ({ body }, context, callback) => {
  function sendResponse(response) {
    callback(null, response);
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(body);
  } catch (ex) {
    sendResponse(buildResponse(400, { message: 'Event doesn\'t contain a parseable JSON body' }));
    return;
  }
  const { url: longUrl, hashLength } = parsedBody;
  if (!longUrl) {
    sendResponse(buildResponse(400, { message: 'Event body must contain a `url` to be shortened' }));
    return;
  }

  validate(longUrl)
    .then(calculateHash(hashLength))
    .then(createS3Object)
    .then(path => sendResponse(buildResponse(200, { message: 'OK', path })))
    .catch(err => sendResponse(handleError(err)));
};
