# longlinks

A serverless URL shortener that leverages AWS Lambda for short link creation, and S3 for link
storage and redirection.

The serverless scaffolding for this was largely lifted from
[@danielireson](https://github.com/danielireson)'s excellent
[tutorial](https://medium.freecodecamp.org/how-to-build-a-serverless-url-shortener-using-aws-lambda-and-s3-4fbdf70cbf5c).

`longlinks` uses a consistent hashing algorithm to convert long URLs into 10-character short
hashes, encoded with a base 48 character set.

It is optimized for ease of operation, cost effectiveness at high scale, and for generating URLs
suitable for social media sharing.
