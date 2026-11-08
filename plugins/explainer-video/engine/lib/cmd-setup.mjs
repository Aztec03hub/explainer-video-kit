// ev setup: installs the engine's dependencies (npm ci), downloads the render browser, then runs doctor.
// Safe to run again. Needs no key. The doctor it ends with prints the PATH hint for the ev shim.
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { missingDeps, setupCmd, ENGINE, parseArgs, log, which, hyperframesCmd, hfEnv } from './common.mjs';

const step = (cmd, args, env) => {
  log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ENGINE, stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.error) throw new Error(`could not run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status}). Fix the error above and run ${setupCmd()} again.`);
};

// Same as step(), but the child's output is shown live AND kept, so a download stall can be told from other failures.
const stepTee = (cmd, args, env) => new Promise((resolve, reject) => {
  log(`\n$ ${cmd} ${args.join(' ')}`);
  let text = '';
  const c = spawn(cmd, args, { cwd: ENGINE, env, stdio: ['inherit', 'pipe', 'pipe'] });
  c.stdout.on('data', (d) => { process.stdout.write(d); text += d; });
  c.stderr.on('data', (d) => { process.stderr.write(d); text += d; });
  c.on('error', (e) => reject(new Error(`could not run ${cmd}: ${e.message}`)));
  c.on('close', (status) => resolve({ status, text }));
});
const NETWORK = /stalled|no data for|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network/i;
const CHROME_HINT = 'To use a Chrome or Chromium you already have, set HYPERFRAMES_BROWSER_PATH=/path/to/chrome and run setup again.';

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
  const own = process.env.HYPERFRAMES_BROWSER_PATH;
  if (own && fs.existsSync(own)) log(`\nHYPERFRAMES_BROWSER_PATH is set to ${own}: skipping the browser download.`);
  else {
    const hf = hyperframesCmd(['browser', 'ensure']);
    let r = await stepTee(hf.cmd, hf.args, hfEnv());
    if (r.status !== 0 && NETWORK.test(r.text)) {
      log('\nThe browser download stalled or lost the network. Retrying once; hyperframes keeps what it already fetched in its cache, so it resumes if it can.');
      r = await stepTee(hf.cmd, hf.args, hfEnv());
      if (r.status !== 0 && NETWORK.test(r.text)) throw new Error(`the browser download failed twice. ${CHROME_HINT} Or try again later: ${setupCmd()}`);
    }
    if (r.status !== 0) throw new Error(`${hf.cmd} ${hf.args.join(' ')} failed (exit ${r.status}). Fix the error above and run ${setupCmd()} again.`);
  }
  // Loaded only now: the doctor chain imports packages that npm ci has just installed.
  const { default: doctor } = await import('./cmd-doctor.mjs');
  await doctor(['--need', 'render,frames']);
}
