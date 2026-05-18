/**
 * Extracts workflow_dispatch inputs from a GitHub Actions YAML string.
 * Returns key, default value, and description for each input.
 */
export interface WorkflowInput {
  key:         string;
  value:       string;
  description: string;
}

export function parseDispatchInputs(yaml: string): WorkflowInput[] {
  const lines = yaml.split('\n');

  // Locate `workflow_dispatch:` line
  const wdIdx = lines.findIndex(l => /^\s*workflow_dispatch\s*:/.test(l));
  if (wdIdx === -1) return [];
  const wdIndent = lines[wdIdx].search(/\S/);

  // Find `inputs:` block directly under workflow_dispatch
  let inputsIdx = -1;
  let inputsIndent = -1;
  for (let i = wdIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const ind = l.search(/\S/);
    if (ind <= wdIndent) break;
    if (/^\s*inputs\s*:/.test(l)) { inputsIdx = i; inputsIndent = ind; break; }
  }
  if (inputsIdx === -1) return [];

  // Detect the indentation of the first input key
  let keyIndent = -1;
  for (let i = inputsIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const ind = l.search(/\S/);
    if (ind <= inputsIndent) return [];
    keyIndent = ind;
    break;
  }
  if (keyIndent === -1) return [];

  const result: WorkflowInput[] = [];
  let currentKey: string | null = null;

  for (let i = inputsIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const ind = l.search(/\S/);
    if (ind <= inputsIndent) break;

    const trimmed = l.trim();
    const km = trimmed.match(/^([\w-]+)\s*:/);
    if (!km) continue;

    if (ind === keyIndent) {
      currentKey = km[1];
      result.push({ key: currentKey, value: '', description: '' });
    } else if (currentKey) {
      const entry = result[result.length - 1];
      if (!entry || entry.key !== currentKey) continue;

      if (km[1] === 'default') {
        const vm = trimmed.match(/^default\s*:\s*(.*)$/);
        if (vm) {
          entry.value = vm[1].trim().replace(/^(['"])(.*)\1$/, '$2');
        }
      } else if (km[1] === 'description') {
        const dm = trimmed.match(/^description\s*:\s*(.*)$/);
        if (dm) {
          entry.description = dm[1].trim().replace(/^(['"])(.*)\1$/, '$2');
        }
      }
    }
  }

  return result;
}
