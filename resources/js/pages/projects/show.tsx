import { CommandButton } from '@/components/projects/command-button';
import { CommandOutput } from '@/components/projects/command-output';
import { ProjectStatusBadge } from '@/components/projects/project-status-badge';
import { ServiceList } from '@/components/projects/service-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { index, destroy, show } from '@/actions/App/Http/Controllers/Projects/ProjectController';
import { index as filesIndex } from '@/actions/App/Http/Controllers/Projects/ProjectFileController';
import { type BreadcrumbItem } from '@/types';
import { type DockerService, type Project, type CommandEvent } from '@/types/projects';
import { Head, Link, router } from '@inertiajs/react';
import { FileCode, Trash2 } from 'lucide-react';
import { useState, useCallback } from 'react';

interface Props {
    project: Project;
    services: DockerService[];
}

export default function ProjectShow({ project, services }: Props) {
    const [commandOutput, setCommandOutput] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Projects',
            href: index().url,
        },
        {
            title: project.name,
            href: show(project.encoded_path).url,
        },
    ];

    const handleCommandStart = useCallback(() => {
        setCommandOutput([]);
        setIsRunning(true);
    }, []);

    const handleCommandOutput = useCallback((event: CommandEvent) => {
        if (event.type === 'output' && event.data) {
            setCommandOutput((prev) => [...prev, event.data!]);
        } else if (event.type === 'error' && event.message) {
            setCommandOutput((prev) => [...prev, `Error: ${event.message}`]);
        } else if (event.type === 'done') {
            setIsRunning(false);
            router.reload({ only: ['project', 'services'] });
        }
    }, []);

    const handleRemove = () => {
        if (confirm('Are you sure you want to remove this project?')) {
            router.delete(destroy(project.encoded_path).url);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={project.name} />

            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-semibold">{project.name}</h1>
                            <ProjectStatusBadge status={project.status} />
                        </div>
                        {project.description && (
                            <p className="text-muted-foreground mt-1 text-sm">{project.description}</p>
                        )}
                        <p className="text-muted-foreground mt-1 text-xs font-mono">{project.path}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" asChild>
                            <Link href={filesIndex(project.encoded_path).url}>
                                <FileCode className="mr-2 h-4 w-4" />
                                Files
                            </Link>
                        </Button>
                        {project.is_manual && (
                            <Button variant="destructive" size="icon" onClick={handleRemove}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <CommandButton
                        projectPath={project.encoded_path}
                        command="up"
                        args={['-d']}
                        variant="default"
                        disabled={isRunning}
                        onStart={handleCommandStart}
                        onOutput={handleCommandOutput}
                    >
                        Start
                    </CommandButton>
                    <CommandButton
                        projectPath={project.encoded_path}
                        command="stop"
                        variant="outline"
                        disabled={isRunning}
                        onStart={handleCommandStart}
                        onOutput={handleCommandOutput}
                    >
                        Stop
                    </CommandButton>
                    <CommandButton
                        projectPath={project.encoded_path}
                        command="restart"
                        variant="outline"
                        disabled={isRunning}
                        onStart={handleCommandStart}
                        onOutput={handleCommandOutput}
                    >
                        Restart
                    </CommandButton>
                    <CommandButton
                        projectPath={project.encoded_path}
                        command="down"
                        variant="outline"
                        disabled={isRunning}
                        onStart={handleCommandStart}
                        onOutput={handleCommandOutput}
                    >
                        Down
                    </CommandButton>
                    <CommandButton
                        projectPath={project.encoded_path}
                        command="pull"
                        variant="outline"
                        disabled={isRunning}
                        onStart={handleCommandStart}
                        onOutput={handleCommandOutput}
                    >
                        Pull
                    </CommandButton>
                    <CommandButton
                        projectPath={project.encoded_path}
                        command="build"
                        variant="outline"
                        disabled={isRunning}
                        onStart={handleCommandStart}
                        onOutput={handleCommandOutput}
                    >
                        Build
                    </CommandButton>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Services</CardTitle>
                            <CardDescription>
                                {services.length} service{services.length !== 1 ? 's' : ''} in this project
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ServiceList services={services} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Command Output</CardTitle>
                            <CardDescription>
                                {isRunning ? 'Running...' : 'Last command output'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CommandOutput lines={commandOutput} isRunning={isRunning} />
                        </CardContent>
                    </Card>
                </div>

                {project.custom_commands.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Custom Commands</CardTitle>
                            <CardDescription>
                                Commands defined in alfredo.yml
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                {project.custom_commands.map((cmd) => (
                                    <Button key={cmd.name} variant="secondary" disabled>
                                        {cmd.name}
                                    </Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
