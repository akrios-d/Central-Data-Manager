/**
 * Extracts workflow_dispatch inputs from a GitHub Actions YAML string.
 * Returns key, default value, and description for each input.
 */
export interface WorkflowInput {
  key: string;
  value: string;
  description: string;
}

export function parseDispatchInputs(yaml: string): WorkflowInput[] {
  const lines = yaml.split('\n');
  const wdIdx = lines.findIndex((l) => /^\s*workflow_dispatch\s*:/.test(l));
  if (wdIdx === -1) return [];

  const inputsBlock = findInputsBlock(lines, wdIdx);
  if (!inputsBlock) return [];

  const keyIndent = findKeyIndent(lines, inputsBlock.idx, inputsBlock.indent);
  if (keyIndent === -1) return [];

  return collectInputs(lines, inputsBlock.idx, inputsBlock.indent, keyIndent);
}

function findInputsBlock(lines: string[], wdIdx: number): { idx: number; indent: number } | null {
  const wdIndent = lines[wdIdx].search(/\S/);
  for (let i = wdIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const ind = l.search(/\S/);
    if (ind <= wdIndent) break;
    if (/^\s*inputs\s*:/.test(l)) return { idx: i, indent: ind };
  }
  return null;
}

function findKeyIndent(lines: string[], inputsIdx: number, inputsIndent: number): number {
  for (let i = inputsIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const ind = l.search(/\S/);
    if (ind <= inputsIndent) return -1;
    return ind;
  }
  return -1;
}

function applyProperty(entry: WorkflowInput | undefined, prop: string, trimmed: string): void {
  if (!entry) return;
  if (prop === 'default') {
    const vm = /^default\s*:\s*(.*)$/.exec(trimmed);
    if (vm) entry.value = vm[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  } else if (prop === 'description') {
    const dm = /^description\s*:\s*(.*)$/.exec(trimmed);
    if (dm) entry.description = dm[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

function collectInputs(
  lines: string[],
  inputsIdx: number,
  inputsIndent: number,
  keyIndent: number,
): WorkflowInput[] {
  const result: WorkflowInput[] = [];
  let currentKey: string | null = null;
  const keyRe = /^([\w-]+)\s*:/;

  for (let i = inputsIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const ind = l.search(/\S/);
    if (ind <= inputsIndent) break;

    const km = keyRe.exec(l.trim());
    if (!km) continue;

    if (ind === keyIndent) {
      currentKey = km[1];
      result.push({ key: currentKey, value: '', description: '' });
    } else if (currentKey) {
      applyProperty(result.at(-1), km[1], l.trim());
    }
  }

  return result;
}
