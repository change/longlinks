# longlinks

A serverless URL shortener that leverages Amazon Lambda for short link creation, and S3 for link
storage and redirection.

The scaffolding for this was largely lifted from [@danielireson](https://github.com/danielireson)'s
[excellent
tutorial](https://medium.freecodecamp.org/how-to-build-a-serverless-url-shortener-using-aws-lambda-and-s3-4fbdf70cbf5c),
but we do a couple of things differently with the actual link generation.  

For one thing, we use a consistent hashing algorithm to convert long URLs into 10-character short
hashes.  The _consistentcy_ means that we never need to check if a short value is already in use.  A
given long URL will always hash to the same short URL.
