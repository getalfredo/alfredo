import { cn } from '@/lib/utils';
import { themes, useTheme } from '@/hooks/use-theme';
import { Check } from 'lucide-react';
import { HTMLAttributes } from 'react';

export default function ThemeSelector({
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    const { theme, updateTheme } = useTheme();

    return (
        <div
            className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}
            {...props}
        >
            {themes.map((t) => (
                <button
                    key={t.value}
                    onClick={() => updateTheme(t.value)}
                    className={cn(
                        'relative flex flex-col items-center rounded-lg border-2 p-4 transition-all',
                        theme === t.value
                            ? 'border-primary bg-accent'
                            : 'border-border hover:border-primary/50 hover:bg-accent/50',
                    )}
                >
                    <div
                        data-theme={t.value}
                        className="mb-2 h-12 w-12 rounded-full border bg-primary"
                    />
                    <span className="text-sm font-medium">{t.label}</span>
                    {theme === t.value && (
                        <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
                    )}
                </button>
            ))}
        </div>
    );
}
