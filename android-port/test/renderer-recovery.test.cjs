const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

test('display recovery bounds crash loops, expires old failures and permits explicit retry', t => {
    if (!process.env.JAVA_HOME) { t.skip('Set JAVA_HOME to the build JDK'); return; }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gsender-renderer-'));
    try {
        execFileSync(path.join(process.env.JAVA_HOME, 'bin/javac'), ['-d', directory,
            path.resolve(__dirname, '../app/src/main/java/com/gsender/android/RendererRecovery.java'),
            path.join(__dirname, 'RendererRecoveryTest.java')]);
        execFileSync(path.join(process.env.JAVA_HOME, 'bin/java'), ['-cp', directory, 'com.gsender.android.RendererRecoveryTest']);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
