import { Badge } from '@/components/ui/badge';
import { type DockerService } from '@/types/projects';
import { cn } from '@/lib/utils';
import { Container } from 'lucide-react';

interface Props {
    service: DockerService;
}

export function ServiceCard({ service }: Props) {
    const isRunning = service.status.toLowerCase().includes('running') ||
        service.status.toLowerCase().includes('up');

    return (
        <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
                <Container className="text-muted-foreground h-5 w-5" />
                <div>
                    <p className="font-medium">{service.name}</p>
                    {service.image && (
                        <p className="text-muted-foreground text-xs">{service.image}</p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2">
                {service.ports && (
                    <span className="text-muted-foreground text-xs font-mono">{service.ports}</span>
                )}
                <Badge
                    variant="outline"
                    className={cn(
                        isRunning
                            ? 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400'
                            : 'bg-gray-500/10 text-gray-600 border-gray-500/20 dark:text-gray-400'
                    )}
                >
                    {service.status}
                </Badge>
            </div>
        </div>
    );
}
