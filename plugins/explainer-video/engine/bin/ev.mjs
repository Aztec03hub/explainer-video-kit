#!/usr/bin/env node
// ev: the one command behind the explainer-video plugin. Each command lives in lib/cmd-<name>.mjs and exports
// `default async function (argv)`; this file only finds it. Run `ev help`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const SUMMARY = {
  doctor: 'check what is installed and which keys are set',
  setup: 'install the engine dependencies and the render browser, then doctor',
  init: 'scaffold a video project',
  script: 'parse script.md: beats, spoken words, word count, length; --lint checks the rules',
  voice: 'speak the script with ElevenLabs (also: voice models | voices | clone)',
  music: 'fetch a Pixabay track into the project, with its licence record (--list for suggestions)',
  align: 'word times for a recording you made yourself',
  captions: 'word-timed captions, SRT and VTT from the voice',
  frames: 'capture the picture states of an HTML page',
  build: 'mix the audio, render the film, run the gates',
  gates: 'run the quality gates on a cut',
  contact: 'contact sheets of a cut for reviewers',
  'review-page': 'a static review page: video, downloads, tagged script',
  'scan-secrets': 'fail on anything shaped like an API key',
};

const [cmd, ...argv] = process.argv.slice(2);
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log('usage: ev <command> [options]\n');
  for (const [k, v] of Object.entries(SUMMARY)) console.log(`  ${k.padEnd(13)} ${v}`);
  console.log('\nRun `ev <command> --help` for a command\'s options. Start with `ev doctor`.');
  process.exit(cmd ? 0 : 1);
}
const file = path.join(LIB, `cmd-${cmd}.mjs`);
if (!/^[a-z-]+$/.test(cmd) || !fs.existsSync(file)) {
  console.error(`ev: unknown command "${cmd}". Run: ev help`);
  process.exit(2);
}
process.env.HYPERFRAMES_NO_TELEMETRY = '1';
try {
  const mod = await import(pathToFileURL(file).href);
  await mod.default(argv);
} catch (e) {
  if (e.code === 'ERR_MODULE_NOT_FOUND' && /Cannot find package/.test(e.message)) e.message = `an engine dependency is not installed (${/package '([^']+)'/.exec(e.message)?.[1] || 'unknown'}). Run: ev setup`;
  console.error(`ev ${cmd}: ${e.message}`);
  if (process.env.EV_DEBUG) console.error(e.stack);
  process.exit(1);
}
