const path = require('node:path');
const express = require('express');
exports.viteServer = async app => {
    const directory = path.join(process.env.GSENDER_BUNDLE_DIR, 'app');
    const pendant = path.join(process.env.GSENDER_BUNDLE_DIR, 'pendant');
    app.use('/pendant', express.static(pendant, {setHeaders(res, file) { if (path.basename(file) === 'index.html') res.setHeader('Cache-Control', 'no-store'); }}));
    app.get('/pendant/*', (req, res) => res.setHeader('Cache-Control', 'no-store') && res.sendFile(path.join(pendant, 'index.html')));
    app.use(express.static(directory, {setHeaders(res, file) {
        if (path.basename(file) === 'index.html') res.setHeader('Cache-Control', 'no-store');
    }}));
    app.get('*', (req, res) => res.sendFile(path.join(directory, 'index.html')));
};
