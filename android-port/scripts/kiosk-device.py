#!/usr/bin/env python3
"""Check or explicitly enroll one tablet for gSender managed kiosk. Never resets data."""
import argparse
import json
import re
import subprocess
import sys

PACKAGE = 'com.gsender.android'
COMPONENT = PACKAGE + '/.KioskAdminReceiver'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--adb', default='adb')
parser.add_argument('--serial', required=True)
parser.add_argument('--enable', action='store_true', help='Enroll this tablet after all checks pass; default is read-only')
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_.:-]+', args.serial):
    parser.error('Invalid tablet serial')
adb = [args.adb, '-s', args.serial]
def run(*command):
    return subprocess.check_output(adb + list(command), text=True, stderr=subprocess.STDOUT, timeout=30).strip()
try:
    if run('get-state') != 'device':
        raise RuntimeError('Unlock the tablet and authorize USB debugging first.')
    sdk = int(run('shell', 'getprop', 'ro.build.version.sdk'))
    if sdk < 28:
        raise RuntimeError('Managed kiosk setup requires Android 9 or newer for full system-bar controls.')
    users = run('shell', 'pm', 'list', 'users')
    if re.findall(r'UserInfo\{(\d+):', users) != ['0']:
        raise RuntimeError('Expected only the primary Android user. No users were changed.')
    accounts = run('shell', 'dumpsys', 'account')
    counts = re.findall(r'^\s*Accounts:\s*(\d+)\s*$', accounts, re.M)
    if not counts or any(int(count) for count in counts):
        raise RuntimeError('Android accounts are present or could not be checked. No accounts were changed.')
    policy = run('shell', 'dumpsys', 'device_policy')
    admins = re.findall(r'ComponentInfo\{([^}]+)\}', policy)
    if any(not name.startswith(PACKAGE + '/') for name in admins):
        raise RuntimeError('Another device administrator is present. Its policies were not changed.')
    receivers = run('shell', 'cmd', 'package', 'query-receivers', '--components',
                    '-a', 'android.app.action.DEVICE_ADMIN_ENABLED', '-p', PACKAGE)
    if 'KioskAdminReceiver' not in receivers:
        raise RuntimeError('Install a gSender build containing kiosk support first; Build 58 does not contain it.')
    print(json.dumps({'serial': args.serial, 'model': run('shell', 'getprop', 'ro.product.model'),
                      'sdk': sdk, 'accounts': 0, 'compatible_receiver': True,
                      'mode': 'enroll' if args.enable else 'check'}, indent=2), flush=True)
    if not args.enable:
        print('Checks passed. No tablet settings changed. Use --enable to enroll.')
        sys.exit(0)
    # Android is the final authority; failure stops here. No reset or account removal fallback.
    if 'Device Owner' not in policy:
        print(run('shell', 'dpm', 'set-device-owner', COMPONENT), flush=True)
    after = run('shell', 'dumpsys', 'device_policy')
    if 'Device Owner' not in after or 'KioskAdminReceiver' not in after:
        raise RuntimeError('Device-owner enrollment could not be verified.')
    print(run('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity'))
    print('Enrolled. Verify five-tap exit and re-entry before disconnecting USB debugging.')
except (RuntimeError, ValueError, subprocess.SubprocessError) as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
