// ev setup: installs the engine's dependencies (npm ci), downloads the render browser, then runs doctor.
// Safe to run again. Needs no key. The doctor it ends with prints the PATH hint for the ev shim.
import fs from 'node:fs';
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

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['help'] });
  if (a.help) return log('usage: ev setup\nnpm ci in the engine, hyperframes browser ensure, then ev doctor. Idempotent; no key needed.');
  log('ev setup downloads the engine dependencies (npm ci) and a render browser of about 114 MB; on a slow link that can take several minutes.');
  log(`To use a Chrome or Chromium you already have instead, run with HYPERFRAMES_BROWSER_PATH=/path/to/chrome (the browser download is then skipped).`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (!which(npm)) throw new Error(`npm is not on PATH. It comes with Node: install Node 22 or newer from https://nodejs.org, then run ${setupCmd()} again.`);
  step(npm, ['ci'], process.env);
  const missing = missingDeps();
  if (missing.length) throw new Error(`npm ci did not install ${missing.join(', ')}. Run: npm ci --prefix "${ENGINE}" and read its output.`);
  const own = ['HYPERFRAMES_BROWSER_PATH', 'PRODUCER_HEADLESS_SHELL_PATH'].find((k) => process.env[k] && fs.existsSync(process.env[k]));
  if (own) log(`\n${own} is set to ${process.env[own]}: skipping the browser download.`);
  else {
    const hf = hyperframesCmd(['browser', 'ensure']);
    if (run(hf.cmd, hf.args, hfEnv()) !== 0) {
      log('\nThe browser download failed (the reason is above). Retrying once; the retry starts the download again from the beginning.');
      if (run(hf.cmd, hf.args, hfEnv()) !== 0) throw new Error(`the browser download failed twice (see above). Run it again with: ${setupCmd()}`);
    }
  }
  // Loaded only now: the doctor chain imports packages that npm ci has just installed.
  const { default: doctor } = await import('./cmd-doctor.mjs');
  await doctor(['--need', 'render,frames']);
}
