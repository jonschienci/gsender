const assert = require('node:assert/strict');
const bridge = process._linkedBinding('gsender_usb');
const messages = ['ASCII ping', 'Unicode jog: ± Δ 🔧', 'x'.repeat(8192)];
let index = 0;
const timeout = setTimeout(() => { console.error('JNI_PROBE_FAIL timeout'); process.exit(1); }, 5000);
bridge.subscribe(value => {
  assert.equal(value, messages[index++]);
  if (index === messages.length) {
    clearTimeout(timeout);
    console.log('JNI_PROBE_PASS ' + JSON.stringify({node: process.version, platform: process.platform, messages: index}));
    process.exit(0);
  }
  bridge.send(messages[index]);
});
bridge.send(messages[0]);
