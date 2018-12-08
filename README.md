[![CircleCI](https://circleci.com/gh/change/longlinks/tree/master.svg?style=svg&circle-token=12bd98027541fe8fa0b4b9a250cdf8f9fe0a2ba0)](https://circleci.com/gh/change/longlinks/tree/master)

# longlinks

A serverless URL shortener that leverages AWS Lambda for short link creation, and S3 for link
storage and redirection.

The serverless scaffolding for this was largely lifted from
[@danielireson](https://github.com/danielireson)'s excellent
[tutorial](https://medium.freecodecamp.org/how-to-build-a-serverless-url-shortener-using-aws-lambda-and-s3-4fbdf70cbf5c).

`longlinks` uses a consistent hashing algorithm to convert long URLs into short hashes, encoded with
a base-48 alphanumeric character set.  It is optimized for ease of operation, cost effectiveness at
scale, and for generating URLs suitable for social media sharing.  A list of allowed domains (for
input URLs) must be specified as part of your configuration.

> **Note:** The consistent hashing algorithm allows for fast and simple link _creation_, but also
means that there's a very small but non-zero chance of "collisions", where two different URLs
shorten to the same value.  If your links will stay relevant in perpetuity, it's probably not the
approach you want.

## Installing

Either checkout this repo, or else just install via npm:

```sh
  npm install @change-org/longlinks
  cd node_modules/@change-org/longlinks
```

The longlinks package is actually a deployable serverless app.  Deploying it will automatically
provision the necessary AWS services (Lambda, API Gateway, S3 bucket, using a CloudFormation stack)
according to your configuration file.

To deploy it, you'll just need a couple of things:

### AWS Credentials & Serverless

The [serverless quick start
guide](https://serverless.com/framework/docs/providers/aws/guide/quick-start/) explains how to set
up your AWS provider credentials.

Also install the serverless CLI tool via npm:

```sh
  npm install -g serverless
```

### config.json

Create a file called `config.json` in the longlinks directory.  You can start by copying
`config.sample.json`, and filling in a few details, especially:

| Field              | Description                                               |
| :----------------- | :-------------------------------------------------------- |
| `bucket`           | The name of the S3 bucket you want to create / deploy to  |
| `domain_safe_list` | List of input domains that your shortener will accept     |
| `short_domain`     | If you have a short domain, you'll also need to configure it as an alias for your S3 bucket's _static website hostname_, later. |

If you are going to use a short domain, you probably want to manage the DNS records for it using
Amazon Route 53, in which case Amazon requires that your bucket name _matches_ the short domain.
So, for example use `"bucket": "xyz.io"` and `"short_domain": "http://xyz.io"`.

## Deploying

Now you can deploy:

```sh
  serverless deploy
```

This will output the URL of the API Gateway endpoint for your Lambda function.  You can also log in
to the AWS console, go to CloudFormation, and see all the details about the stack that was created.

## Creating a short link

Try creating a new "short" link by using curl to call the endpoint:

```sh
  curl -X POST -H "Content-Type: application/json" -d '{"url":"http://example.com/"}' <endpoint_url>
```

The response will show you the short hash value for that URL, as well as the final short URL.  A
file with that name will have been created in your S3 bucket, and accessing that file via the
_static website hostname_ (ie., the one with the hostname including `<bucket-name>.s3-website-`) for
the bucket will result in a 301 redirect to your destination URL!

Attempts to shorten invalid URLs, or anything not matching the `domain_safe_list` will result in a
400 response.

### Specifying a custom hash length

By default, longlinks generates 10-character hashes.  But you can specify any length in the range
[7, 12] characters by including a `hashLength` parameter in the JSON body.  Shorter hashes will have
a greater chance of collisions, but that might be acceptable for certain uses.

```
  -d '{"url":"http://example.com","hashLength":7}'
```
