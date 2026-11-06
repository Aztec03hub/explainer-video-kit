// ev setup: installs the engine's dependencies (npm ci), downloads the render browser, then runs doctor.
// Safe to run again. Needs no key.
import { spawnSync } from 'node:child_process';
import { ENGINE, parseArgs, log, which, hyperframesBin, hfEnv } from './common.mjs';
import doctor from './cmd-doctor.mjs';

const step = (cmd, args, env) => {
  log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ENGINE, stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (r.error) throw new Error(`could not run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status}). Fix the error above and run ev setup again.`);
};

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['help'] });
  if (a.help) return log('usage: ev setup\nnpm ci in the engine, hyperframes browser ensure, then ev doctor. Idempotent; no key needed.');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (!which(npm)) throw new Error('npm is not on PATH. It comes with Node: install Node 22 or newer from https://nodejs.org, then run ev setup again.');
  step(npm, ['ci'], process.env);
  step(hyperframesBin(), ['browser', 'ensure'], hfEnv());
  await doctor(['--need', 'render,frames']);
}
