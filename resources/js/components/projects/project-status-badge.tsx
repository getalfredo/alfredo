import { Badge } from '@/components/ui/badge';
import { type ProjectStatus } from '@/types/projects';
import { cn } from '@/lib/utils';

interface Props {
    status: ProjectStatus;
    className?: string;
}

const statusConfig: Record<ProjectStatus, { label: string; className: string }> = {
    running: {
        label: 'Running',
        className: 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400',
    },
    stopped: {
        label: 'Stopped',
        className: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
    },
    partial: {
        label: 'Partial',
        className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20 dark:text-yellow-400',
    },
    unknown: {
        label: 'Unknown',
        className: 'bg-gray-500/10 text-gray-600 border-gray-500/20 dark:text-gray-400',
    },
};

export function ProjectStatusBadge({ status, className }: Props) {
    const config = statusConfig[status];

    return (
        <Badge variant="outline" className={cn(config.className, className)}>
            {config.label}
        </Badge>
    );
}
