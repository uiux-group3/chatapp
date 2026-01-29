import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  content: string;
};

function normalizeCodeText(value: unknown) {
  const text = Array.isArray(value) ? value.join('') : String(value ?? '');
  return text.replace(/\n$/, '');
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // noop
    }
  };

  return (
    <button type="button" className="md-copy-button" onClick={onCopy} aria-label="コードをコピー">
      {copied ? 'コピーしました' : 'コピー'}
    </button>
  );
}

export default function Markdown({ content }: Props) {
  const components = useMemo(
    () => ({
      p: (props: any) => <p className="mb-2 last:mb-0" {...props} />,
      code: ({ inline, className, children, ...props }: any) => {
        if (inline) {
          return (
            <code className={`md-inline-code ${className ?? ''}`} {...props}>
              {children}
            </code>
          );
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      pre: ({ children }: any) => {
        const childArray = Array.isArray(children) ? children : [children];
        const codeEl = childArray.find(c => c && typeof c === 'object' && 'props' in c) as any;

        const className: string = codeEl?.props?.className ?? '';
        const match = /language-([a-z0-9_-]+)/i.exec(className);
        const lang = match?.[1]?.toUpperCase() ?? 'CODE';
        const codeText = normalizeCodeText(codeEl?.props?.children);

        return (
          <div className="md-code-block">
            <div className="md-code-header">
              <span className="md-code-lang">{lang}</span>
              <CopyButton text={codeText} />
            </div>
            <pre className="md-code-pre">
              <code className={className}>{codeText}</code>
            </pre>
          </div>
        );
      },
    }),
    [],
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

