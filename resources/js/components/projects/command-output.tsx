import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Props {
    lines: string[];
    isRunning?: boolean;
    className?: string;
}

export function CommandOutput({ lines, isRunning = false, className }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [lines]);

    return (
        <div
            ref={containerRef}
            className={cn(
                'h-64 overflow-auto rounded-lg bg-black p-3 font-mono text-sm text-green-400',
                className
            )}
        >
            {lines.length === 0 ? (
                <p className="text-gray-500">
                    {isRunning ? 'Waiting for output...' : 'No output yet. Run a command to see results.'}
                </p>
            ) : (
                lines.map((line, index) => (
                    <div key={index} className="whitespace-pre-wrap break-all">
                        {line}
                    </div>
                ))
            )}
            {isRunning && (
                <span className="inline-block animate-pulse">_</span>
            )}
        </div>
    );
}
