import { Button } from '@/components/ui/button';
import { execute } from '@/actions/App/Http/Controllers/Projects/ProjectCommandController';
import { type CommandEvent } from '@/types/projects';
import { useCallback, type ReactNode, type ComponentProps } from 'react';

interface Props extends Omit<ComponentProps<typeof Button>, 'onClick'> {
    projectPath: string;
    command: string;
    args?: string[];
    children: ReactNode;
    onStart?: () => void;
    onOutput?: (event: CommandEvent) => void;
}

export function CommandButton({
    projectPath,
    command,
    args = [],
    children,
    onStart,
    onOutput,
    ...buttonProps
}: Props) {
    const handleClick = useCallback(() => {
        onStart?.();

        const url = new URL(execute(projectPath, command).url, window.location.origin);

        if (args.length > 0) {
            args.forEach((arg, index) => {
                url.searchParams.append(`args[${index}]`, arg);
            });
        }

        const eventSource = new EventSource(url.toString());

        eventSource.onmessage = (event) => {
            try {
                const data: CommandEvent = JSON.parse(event.data);
                onOutput?.(data);

                if (data.type === 'done') {
                    eventSource.close();
                }
            } catch (error) {
                console.error('Failed to parse SSE event:', error);
            }
        };

        eventSource.onerror = () => {
            onOutput?.({ type: 'error', message: 'Connection failed' });
            onOutput?.({ type: 'done', success: false });
            eventSource.close();
        };
    }, [projectPath, command, args, onStart, onOutput]);

    return (
        <Button {...buttonProps} onClick={handleClick}>
            {children}
        </Button>
    );
}
