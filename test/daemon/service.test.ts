import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SERVICE_LABEL, launchAgentPlist, proxyEnv, systemdUnit } from '../../daemon/service';

const spec = { runtime: '/Users/me/.bun/bin/bun', root: '/Users/me/tacit & co', home: '/Users/me/.tacit' };

describe('the background service', () => {
  test('a launchd agent starts the harness at login and keeps it alive', () => {
    const plist = launchAgentPlist(spec);
    expect(plist).toContain(`<key>Label</key><string>${SERVICE_LABEL}</string>`);
    expect(plist).toContain('<string>/Users/me/.bun/bin/bun</string><string>/Users/me/tacit &#38; co/daemon/server.ts</string>');
    expect(plist).toContain('<key>KeepAlive</key><true/>');
    expect(plist).toContain('<key>TACIT_HOME</key><string>/Users/me/.tacit</string>');
  });

  test.if(process.platform === 'darwin')('the launchd agent is a valid property list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tacit-plist-'));
    try {
      writeFileSync(join(dir, 'a.plist'), launchAgentPlist(spec));
      expect(Bun.spawnSync(['plutil', '-lint', join(dir, 'a.plist')]).exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a systemd unit quotes its paths and restarts the harness if it stops', () => {
    const unit = systemdUnit({ ...spec, root: '/home/me/say "hi"' });
    expect(unit).toContain('ExecStart="/Users/me/.bun/bin/bun" "/home/me/say \\"hi\\"/daemon/server.ts"');
    expect(unit).toContain('Restart=on-failure');
    expect(unit).toContain('Environment="TACIT_HOME=/Users/me/.tacit"');
  });

  test('neither carries a secret', () => {
    for (const text of [launchAgentPlist(spec), systemdUnit(spec)]) expect(text).not.toContain('TYPESAFE');
  });

  test('the shell’s proxy comes along, without a password, and never for this machine', () => {
    const proxy = proxyEnv({ HTTPS_PROXY: 'http://127.0.0.1:7890', ALL_PROXY: 'socks5://me:secret@proxy.example:1080', no_proxy: '.corp' });
    expect(proxy.withPassword).toEqual(['ALL_PROXY']);
    expect(proxy.env).toEqual({ HTTPS_PROXY: 'http://127.0.0.1:7890', NO_PROXY: '.corp,localhost,127.0.0.1,::1', no_proxy: '.corp,localhost,127.0.0.1,::1' });
    expect(proxyEnv({ PATH: '/bin' }).env).toEqual({});
    const withProxy = { ...spec, env: proxy.env };
    expect(launchAgentPlist(withProxy)).toContain('<key>HTTPS_PROXY</key><string>http://127.0.0.1:7890</string>');
    expect(systemdUnit(withProxy)).toContain('Environment="HTTPS_PROXY=http://127.0.0.1:7890"');
    for (const text of [launchAgentPlist(withProxy), systemdUnit(withProxy)]) expect(text).not.toContain('secret');
  });
});
