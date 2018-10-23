const _ = require('lodash');
const AWS = require('aws-sdk');
const { BigInteger } = require('jsbn');
const fnv = require('fnv-plus');
const url = require('url');

const {
  bucket,
  domain_whitelist: domainWhitelist,
  short_domain: shortDomain,
} = require('../config.json'); // eslint-disable-line import/no-unresolved

// Vowels, l, 0, 1, 3 removed mostly to prevent hash forming bad words. The letter 'l' removed to
// avoid ambiguity if user has to manually transcribe short hash.
const base48HashChars = '2456789bcdfghjkmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ';

const S3 = new AWS.S3();

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    _.assign(this, { statusCode });
  }
}

async function validate(longUrl) {
  let host;
  try {
    ({ host } = url.parse(longUrl));
  } catch (ex) {
    throw new HttpError(400, 'Not a valid URL');
  }
  const suffixMatcher = suffix => suffix === host || _.endsWith(host, `.${suffix}`);
  if (!_.find(domainWhitelist, suffixMatcher)) {
    throw new HttpError(
      400,
      `Not an allowed domain for shortening: ${host}, whitelist: ${domainWhitelist}`
    );
  }
  return longUrl;
}

// input is BigInteger Number
function base48encode(input, maxLength) {
  const base = new BigInteger(base48HashChars.length.toString());
  let workingValue = input.clone();
  let result = '';

  do {
    const quotientAndRemainder = workingValue.divideAndRemainder(base);
    const quotient = quotientAndRemainder[0];
    const remainder = quotientAndRemainder[1];
    result = base48HashChars.charAt(remainder.intValue()) + result;
    workingValue = quotient;
  }
  while (workingValue.compareTo(BigInteger.ZERO) > 0 && result.length < maxLength);

  return result;
}

// Hash algorithm
// 1 - take 64 bit FNV hash of string
// 2 - hash again the 'to string' of the first hash (base-10 text)
// 3 - keep the last 10 digits of (2) base 48 encoded
function calculateHash(longUrl) {
  // double hash to improve mixing where only small changes are made to input
  const hashValue = fnv.hash(longUrl, 64).value;
  const hashValueTwice = fnv.hash(hashValue.toString(), 64).value;
  return {
    longUrl,
    hash: base48encode(hashValueTwice, 10),
  };
}

async function createS3Object({ longUrl, hash }) {
  return S3.putObject({
    Bucket: bucket,
    Key: hash,
    WebsiteRedirectLocation: longUrl,
  })
    .promise()
    .then(() => hash);
}

function sendResponse(statusCode, { message, path }, callback) {
  const body = { message, path };

  if (path) {
    body.url = `${shortDomain}/${path}`;
  }

  callback({
    headers: { 'Access-Control-Allow-Origin': '*' },
    statusCode,
    body: JSON.stringify(body),
  });
}

function returnShortUrl(callback) {
  return hashValue => sendResponse(200, {
    message: 'URL successfully shortened',
    path: hashValue,
  }, callback);
}

function handleError(callback) {
  return (err) => {
    sendResponse(
      (err && err.statusCode) || 500,
      { message: (err && err.message) || String(err) },
      callback
    );
  };
}

module.exports.handle = ({ body }, context, callback) => {
  let longUrl;
  try {
    longUrl = JSON.parse(body).url;
  } catch (ex) {
    sendResponse(400, { message: 'Event doesn\'t contain a parseable JSON body' }, callback);
    return;
  }
  if (!longUrl) {
    sendResponse(400, { message: 'Event body must contain a `url` to be shortened' }, callback);
    return;
  }
  validate(longUrl)
    .then(calculateHash)
    .then(createS3Object)
    .then(returnShortUrl(callback))
    .catch(handleError(callback));
};
