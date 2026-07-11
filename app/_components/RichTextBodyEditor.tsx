'use client';

import type { ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown, type MarkdownStorage } from 'tiptap-markdown';
import styles from './RichTextBodyEditor.module.css';

interface RichTextBodyEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  readOnly: boolean;
}

/**
 * "Write" mode's editor — a WYSIWYG surface over the same markdown body the
 * "Markdown" and "Preview" modes use. Markdown stays the single source of
 * truth: this component is only ever mounted while mode === 'write' (see
 * MarkdownEditor.tsx), so switching modes remounts it fresh from the
 * current `content` string rather than needing to reactively sync a
 * ProseMirror doc against external changes — TipTap's `content` prop is
 * only read once, at mount, which is exactly what that gives us for free.
 *
 * `html: false` on the Markdown extension is a deliberate security choice,
 * not the library default (which is `true`): it keeps raw HTML in a post's
 * source from being parsed into live DOM nodes here, matching the same
 * XSS-safety posture as renderSafeMarkdownPreview.
 */
export function RichTextBodyEditor({ content, onChange, readOnly }: RichTextBodyEditorProps) {
  const editor = useEditor({
    // Next.js SSR: without this, TipTap tries to render on the server,
    // which produces a hydration mismatch on a component that's genuinely
    // client-only (there is no meaningful server-rendered state for a rich
    // text editor). See @tiptap/react's own docs for this exact guidance.
    immediatelyRender: false,
    content,
    editable: !readOnly,
    extensions: [
      StarterKit,
      Markdown.configure({
        html: false,
        transformPastedText: true,
      }),
    ],
    onUpdate: ({ editor: instance }) => {
      const markdownStorage = instance.storage as unknown as { markdown: MarkdownStorage };
      onChange(markdownStorage.markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: styles.prose ?? '',
        'aria-label': 'Post content',
      },
    },
  });

  if (!editor) {
    return <div className={styles.loading}>Loading editor…</div>;
  }

  return (
    <div className={styles.shell}>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        <ToolbarButton
          label="Bold"
          active={editor.isActive('bold')}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive('italic')}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>
        <span className={styles.divider} aria-hidden="true" />
        <ToolbarButton
          label="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          label="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <span className={styles.divider} aria-hidden="true" />
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive('bulletList')}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive('orderedList')}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive('blockquote')}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          &ldquo;
        </ToolbarButton>
        <span className={styles.divider} aria-hidden="true" />
        <ToolbarButton
          label="Link"
          active={editor.isActive('link')}
          disabled={readOnly}
          onClick={() => {
            const previousUrl = editor.getAttributes('link').href as string | undefined;
            const url = window.prompt('Link URL', previousUrl ?? 'https://');
            if (url === null) return;
            if (url === '') {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
        >
          Link
        </ToolbarButton>
        <ToolbarButton
          label="Code"
          active={editor.isActive('code')}
          disabled={readOnly}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          {'</>'}
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={active ? styles.toolbarButtonActive : styles.toolbarButton}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
