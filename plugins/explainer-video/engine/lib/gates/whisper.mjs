// Whisper gate: how many script words a Whisper transcript of the voice matched. 211 of 212 and 210 of 212 were
// normal (a number split in two). At least 98 percent passes, 90 to 98 warns (go and listen), under 90 fails.
// The count is take.json's match {matched,total} (stored by `ev align`); without it, it's computed from
// voice/transcript.json by aligning the transcript to the script.
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../common.mjs';
import { spokenWords } from './captions.mjs';
import { align, transcriptWords } from './tags.mjs';

export const name = 'whisper';
export const help = 'whisper: >= 98% of script words matched by the Whisper transcript (warn 90-98, fail under 90); needs ev align (--transcript-only for an ElevenLabs take).';
export const PASS_AT = 0.98, FAIL_UNDER = 0.9;

export default async function whisperGate({ proj }) {
  const takeFile = path.join(proj.voice, 'take.json');
  const take = fs.existsSync(takeFile) ? readJson(takeFile) : null;
  let m = take?.match && Number.isFinite(take.match.total) ? take.match : null;
  if (!m) {
    const tr = fs.existsSync(path.join(proj.voice, 'transcript.json')) ? transcriptWords(proj) : null;
    const scriptFile = path.join(proj.build, 'script.json');
    if (tr && fs.existsSync(scriptFile)) {
      const spoken = spokenWords(readJson(scriptFile));
      // matched = script words found in the transcript, in order
      m = { matched: align(spoken, tr.words).matched, total: spoken.length };
    }
  }
  if (!m) {
    return { name, status: 'SKIP', reason: 'no Whisper result to read: voice/take.json has no match counts and there is no voice/transcript.json (or build/script.json). ' +
      'Run: ev align <project> --transcript-only (or ev align <project> --audio <your recording> for your own voice), then: ev gates <project> --only whisper' };
  }
  const rate = m.total ? m.matched / m.total : 0;
  const status = rate < FAIL_UNDER ? 'FAIL' : 'PASS';
  const warnings = status === 'PASS' && rate < PASS_AT ? [`match rate is under 98 percent (${(rate * 100).toFixed(1)}): listen to the unmatched words before shipping`] : [];
  return {
    name, status, measured: `${m.matched} of ${m.total} script words (${(rate * 100).toFixed(1)}%)`, limit: `>= ${PASS_AT * 100}% (fail under ${FAIL_UNDER * 100}%)`,
    margin: `${((rate - PASS_AT) * 100).toFixed(1)} points`, lines: [], warnings, data: { matched: m.matched, total: m.total, rate },
  };
}
