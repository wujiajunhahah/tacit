// Keeps the harness running: a launchd agent on macOS, a systemd user service on Linux. Both start it at login and
// again if it stops. Secrets such as a model key are never written into them: those files are readable by others.

export const SERVICE_LABEL = 'ai.tacit.harness';
export const SYSTEMD_UNIT = 'tacit-harness.service';

export interface ServiceSpec {
  /** Absolute path to bun. */
  runtime: string;
  /** Absolute path to the tacit checkout. */
  root: string;
  /** The ledger folder; the log goes there too. */
  home: string;
  /** More environment for the harness, e.g. from proxyEnv. Never secrets. */
  env?: Record<string, string>;
}

const PROXY_VARS = ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy'];
const LOOPBACK = ['localhost', '127.0.0.1', '::1'];

/**
 * The proxy settings of the shell that installs the service. A service starts without them, and where the network
 * needs a proxy, every decision would time out. A proxy URL with a password in it is left out, since these files are
 * readable by others; the loopback addresses always bypass the proxy, so the browser and local models reach us.
 */
export function proxyEnv(env: Record<string, string | undefined>): { env: Record<string, string>; withPassword: string[] } {
  const out: Record<string, string> = {};
  const withPassword: string[] = [];
  for (const name of PROXY_VARS) {
    const value = env[name]?.trim();
    if (!value) continue;
    if (/^[a-z][\w+.-]*:\/\/[^/@]*@/i.test(value)) withPassword.push(name);
    else out[name] = value;
  }
  if (Object.keys(out).some((k) => !/^no_proxy$/i.test(k))) {
    const listed = [out.NO_PROXY, out.no_proxy].flatMap((v) => (v ?? '').split(',')).map((s) => s.trim()).filter(Boolean);
    out.NO_PROXY = [...new Set([...listed, ...LOOPBACK])].join(',');
    if (out.no_proxy) out.no_proxy = out.NO_PROXY;
  }
  return { env: out, withPassword };
}

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function launchAgentPlist(s: ServiceSpec): string {
  const string = (v: string) => `<string>${xml(v)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${string(SERVICE_LABEL)}
  <key>ProgramArguments</key>
  <array>${string(s.runtime)}${string(`${s.root}/daemon/server.ts`)}</array>
  <key>WorkingDirectory</key>${string(s.root)}
  <key>EnvironmentVariables</key>
  <dict>${Object.entries({ TACIT_HOME: s.home, ...s.env }).map(([k, v]) => `<key>${xml(k)}</key>${string(v)}`).join('')}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key>${string('Background')}
  <key>StandardOutPath</key>${string(`${s.home}/harness.log`)}
  <key>StandardErrorPath</key>${string(`${s.home}/harness.log`)}
</dict>
</plist>
`;
}

export function systemdUnit(s: ServiceSpec): string {
  const q = (v: string) => `"${v.replace(/(["\\])/g, '\\$1')}"`;
  return `[Unit]
Description=Tacit harness: the local context engine
After=network.target

[Service]
ExecStart=${q(s.runtime)} ${q(`${s.root}/daemon/server.ts`)}
WorkingDirectory=${q(s.root)}
${Object.entries({ TACIT_HOME: s.home, ...s.env }).map(([k, v]) => `Environment=${q(`${k}=${v}`)}`).join('\n')}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`;
}
