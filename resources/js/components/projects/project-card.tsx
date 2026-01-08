import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectStatusBadge } from '@/components/projects/project-status-badge';
import { show } from '@/actions/App/Http/Controllers/Projects/ProjectController';
import { type Project } from '@/types/projects';
import { Link } from '@inertiajs/react';

interface Props {
    project: Project;
}

export function ProjectCard({ project }: Props) {
    return (
        <Link href={show(project.encoded_path).url} className="block">
            <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <ProjectStatusBadge status={project.status} />
                    </div>
                    {project.description && (
                        <CardDescription>{project.description}</CardDescription>
                    )}
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground truncate text-xs font-mono">
                        {project.path}
                    </p>
                    {project.is_manual && (
                        <p className="text-muted-foreground mt-1 text-xs">Manually added</p>
                    )}
                </CardContent>
            </Card>
        </Link>
    );
}
