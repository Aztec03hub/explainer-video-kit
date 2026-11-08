// ev setup: installs the engine's dependencies (npm ci), downloads the render browser, then runs doctor.
// Safe to run again. Needs no key. The doctor it ends with prints the PATH hint for the ev shim.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { missingDeps, setupCmd, ENGINE, parseArgs, log, which, hyperframesCmd, hfEnv } from './common.mjs';

// Output goes straight to the terminal (stdio inherit): hyperframes makes 3 download attempts only when its stdout is a TTY.
const run = (cmd, args, env) => {
  log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ENGINE, stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.error) throw new Error(`could not run ${cmd}: ${r.error.message}`);
  return r.status;
};
const step = (cmd, args, env) => {
  const status = run(cmd, args, env);
  if (status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${status}). Fix the error above and run ${setupCmd()} again.`);
};

// The browser path hyperframes will use: the FIRST of these variables that is set, as in hyperframes' browserPathFromEnv.
const browserFromEnv = () => {
  const name = ['HYPERFRAMES_BROWSER_PATH', 'PRODUCER_HEADLESS_SHELL_PATH'].find((k) => process.env[k]);
  return name && { name, path: process.env[name] };
};
// A Chrome hyperframes (or puppeteer) already downloaded: ensure is then a no-op, so there is nothing to announce.
// Looks for the browser executable itself (a few folders down), not just a non-empty cache folder.
const SHELL = new Set(['chrome-headless-shell', 'chrome-headless-shell.exe', 'chrome', 'chrome.exe']);
const hasBrowser = (dir, depth = 0) => {
  if (depth > 5) return false;
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).some((e) => (e.isDirectory() ? hasBrowser(path.join(dir, e.name), depth + 1) : SHELL.has(e.name)));
  } catch { return false; }
};
const browserCached = () => ['.cache/hyperframes/chrome', '.cache/puppeteer/chrome-headless-shell'].some((d) => hasBrowser(path.join(os.homedir(), d)));
// hyperframes prints a failed download's reason on stdout, so it cannot be read without capturing stdout (which would cost
// its TTY retries). A nearly full disk is the one cause worth ruling out up front, so it is checked by free space.
// A filesystem that reports zero blocks (/proc style) says nothing about free space, so it never counts as low.
export const lowDiskFrom = (f, minMb) => f.blocks > 0 && (f.bavail * f.bsize) / 2 ** 20 < minMb;
export const diskCheckDir = (home) => (fs.existsSync(path.join(home, '.cache')) ? path.join(home, '.cache') : home);
const lowDisk = () => {
  try { return lowDiskFrom(fs.statfsSync(diskCheckDir(os.homedir())), Number(process.env.EV_SETUP_MIN_FREE_MB || 300)); } catch { return false; }
};

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['help'] });
  if (a.help) return log('usage: ev setup\nnpm ci in the engine, hyperframes browser ensure, then ev doctor. Idempotent; no key needed.');
  const env = browserFromEnv();
  if (env && !(fs.existsSync(env.path) && fs.statSync(env.path).isFile())) throw new Error(`${env.name} is set to ${env.path} but no such file exists. Unset it or point it at a Chrome/Chromium binary.`);
  const needBrowser = !env && !browserCached();
  const browserPart = needBrowser ? ' and downloads a render browser of about 114 MB' : '';
  log(`ev setup runs npm ci, which reinstalls the engine dependencies in node_modules${browserPart}; on a slow link that can take several minutes.`);
  if (needBrowser) log('To use a Chrome or Chromium you already have instead, run with HYPERFRAMES_BROWSER_PATH=/path/to/chrome (the browser download is then skipped).');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (!which(npm)) throw new Error(`npm is not on PATH. It comes with Node: install Node 22 or newer from https://nodejs.org, then run ${setupCmd()} again.`);
  step(npm, ['ci'], process.env);
  const missing = missingDeps();
  if (missing.length) throw new Error(`npm ci did not install ${missing.join(', ')}. Run: npm ci --prefix "${ENGINE}" and read its output.`);
  if (env) log(`\n${env.name} is set to ${env.path}: skipping the browser download.`);
  else {
    const hf = hyperframesCmd(['browser', 'ensure']);
    if (run(hf.cmd, hf.args, hfEnv()) !== 0) {
      if (lowDisk()) throw new Error(`the browser download failed and the disk is nearly full, so it is not retried. Free some space (the browser needs about 300 MB), then run: ${setupCmd()}`);
      log('\nThe browser download failed (the reason is above). Retrying once; the retry starts the download again from the beginning.');
      if (run(hf.cmd, hf.args, hfEnv()) !== 0) throw new Error(`the browser download failed twice (see above). Run it again with: ${setupCmd()}`);
    }
  }
  // Loaded only now: the doctor chain imports packages that npm ci has just installed.
  const { default: doctor } = await import('./cmd-doctor.mjs');
  await doctor(['--need', 'render,frames']);
}
