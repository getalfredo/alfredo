import { ServiceCard } from '@/components/projects/service-card';
import { type DockerService } from '@/types/projects';

interface Props {
    services: DockerService[];
}

export function ServiceList({ services }: Props) {
    if (services.length === 0) {
        return (
            <p className="text-muted-foreground py-4 text-center text-sm">
                No services found. Run &quot;docker compose up&quot; to start services.
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {services.map((service) => (
                <ServiceCard key={service.name} service={service} />
            ))}
        </div>
    );
}
