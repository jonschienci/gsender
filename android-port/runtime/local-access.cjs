'use strict';
const crypto = require('node:crypto');
function matches(value) {
    const token = process.env.GSENDER_LOCAL_TOKEN || '';
    return token.length > 0 && typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && value.length === token.length &&
        crypto.timingSafeEqual(Buffer.from(value), Buffer.from(token));
}
exports.authorized = req => {
    const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('gsender_local='));
    return matches(req.headers['x-gsender-key']) || matches(cookie?.slice('gsender_local='.length));
};
exports.report = message => {
    process._linkedBinding('gsender_usb').send(JSON.stringify({host:'ui-status', message}));
};
exports.install = app => app.use((req, res, next) => {
    // Navigation must reauthenticate on every launch, including older cached clients.
    if (req.path === '/' || req.path === '/index.html') {
        res.setHeader('Cache-Control', 'no-store');
        delete req.headers['if-none-match'];
        delete req.headers['if-modified-since'];
    }
    if (!exports.authorized(req)) return res.status(403).end('Open gSender from the Android app.');
    if (matches(req.headers['x-gsender-key'])) res.setHeader('Set-Cookie',
        `gsender_local=${process.env.GSENDER_LOCAL_TOKEN}; HttpOnly; SameSite=Strict; Path=/`);
    next();
});
