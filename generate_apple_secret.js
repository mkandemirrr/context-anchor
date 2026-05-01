const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('/Users/mustafakandemir/Desktop/AuthKey_B2Y297DL32.p8');

const teamId = 'DHY8U89P8M';
const clientId = 'com.contextanchor.web';
const keyId = 'B2Y297DL32';

const token = jwt.sign(
  {
    iss: teamId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (15777000), // 6 months
    aud: 'https://appleid.apple.com',
    sub: clientId,
  },
  privateKey,
  {
    algorithm: 'ES256',
    keyid: keyId,
  }
);

console.log(token);
