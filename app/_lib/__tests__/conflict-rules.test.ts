import { describe, expect, it } from 'vitest';
import { diffParagraphs } from '../conflict-rules';

describe('diffParagraphs', () => {
  it('marks nothing changed when both versions are identical', () => {
    const { local, remote } = diffParagraphs('One.\n\nTwo.', 'One.\n\nTwo.');

    expect(local).toEqual([
      { text: 'One.', changed: false },
      { text: 'Two.', changed: false },
    ]);
    expect(remote).toEqual([
      { text: 'One.', changed: false },
      { text: 'Two.', changed: false },
    ]);
  });

  it('marks only the differing paragraph as changed', () => {
    const { local, remote } = diffParagraphs(
      'Intro.\n\nWe review once carefully.\n\nOutro.',
      'Intro.\n\nWe review twice: accuracy and tone.\n\nOutro.',
    );

    expect(local).toEqual([
      { text: 'Intro.', changed: false },
      { text: 'We review once carefully.', changed: true },
      { text: 'Outro.', changed: false },
    ]);
    expect(remote).toEqual([
      { text: 'Intro.', changed: false },
      { text: 'We review twice: accuracy and tone.', changed: true },
      { text: 'Outro.', changed: false },
    ]);
  });

  it('marks a trailing paragraph present in only one version as changed', () => {
    const { local, remote } = diffParagraphs('Intro.', 'Intro.\n\nNew closing paragraph.');

    expect(local).toEqual([{ text: 'Intro.', changed: false }]);
    expect(remote).toEqual([
      { text: 'Intro.', changed: false },
      { text: 'New closing paragraph.', changed: true },
    ]);
  });

  it('treats blank/whitespace-only input as no paragraphs', () => {
    expect(diffParagraphs('', '   \n\n  ')).toEqual({ local: [], remote: [] });
  });

  it('collapses runs of more than two newlines to a single paragraph break', () => {
    const { local } = diffParagraphs('One.\n\n\n\nTwo.', 'ignored');
    expect(local.map((p) => p.text)).toEqual(['One.', 'Two.']);
  });
});
