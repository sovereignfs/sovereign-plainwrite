export interface DiffParagraph {
  text: string;
  changed: boolean;
}

/**
 * Paragraph-level diff for the conflict review screen — intentionally crude
 * (positional comparison, not a real LCS/Myers diff): split each version on
 * blank lines and mark a paragraph "changed" if the paragraph at the same
 * position differs between versions, or has no counterpart. This misses
 * reordered paragraphs (a moved-but-unchanged paragraph shows as changed on
 * both sides), but for the common case — a writer and a remote edit both
 * touching one or two paragraphs of the same post — it correctly highlights
 * exactly those paragraphs, which is what "review before you overwrite"
 * needs. A real diff library is more than this decision needs.
 */
export function diffParagraphs(
  local: string,
  remote: string,
): { local: DiffParagraph[]; remote: DiffParagraph[] } {
  const localParagraphs = splitParagraphs(local);
  const remoteParagraphs = splitParagraphs(remote);
  const length = Math.max(localParagraphs.length, remoteParagraphs.length);

  const localDiff: DiffParagraph[] = [];
  const remoteDiff: DiffParagraph[] = [];
  for (let i = 0; i < length; i += 1) {
    const localText = localParagraphs[i];
    const remoteText = remoteParagraphs[i];
    const changed = localText !== remoteText;
    if (localText !== undefined) localDiff.push({ text: localText, changed });
    if (remoteText !== undefined) remoteDiff.push({ text: remoteText, changed });
  }

  return { local: localDiff, remote: remoteDiff };
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
