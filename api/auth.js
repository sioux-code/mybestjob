'use strict';

const MOT_DE_PASSE = '2mTDP75';

module.exports = function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const params = new URLSearchParams(body);
    const pwd = params.get('pwd') || '';
    if (pwd === MOT_DE_PASSE) {
      res.setHeader('Set-Cookie', 'mbj-auth=ok; Path=/; Max-Age=604800; SameSite=Strict');
      res.setHeader('Location', '/');
    } else {
      res.setHeader('Location', '/en-construction.html?erreur=1');
    }
    res.statusCode = 302;
    res.end();
  });
};
