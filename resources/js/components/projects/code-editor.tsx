import Editor from '@monaco-editor/react';
import { useAppearance } from '@/hooks/use-appearance';

interface Props {
    value: string;
    language: string;
    onChange: (value: string) => void;
    readOnly?: boolean;
}

export function CodeEditor({ value, language, onChange, readOnly = false }: Props) {
    const { appearance } = useAppearance();

    const isDark = appearance === 'dark' ||
        (appearance === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    const theme = isDark ? 'vs-dark' : 'light';

    return (
        <Editor
            height="100%"
            language={language}
            value={value}
            theme={theme}
            onChange={(value) => onChange(value || '')}
            options={{
                readOnly,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
            }}
        />
    );
}
