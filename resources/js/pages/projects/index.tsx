import { AddProjectDialog } from '@/components/projects/add-project-dialog';
import { ProjectCard } from '@/components/projects/project-card';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { index } from '@/actions/App/Http/Controllers/Projects/ProjectController';
import { type BreadcrumbItem } from '@/types';
import { type Project } from '@/types/projects';
import { Head } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import { useState } from 'react';

interface Props {
    projects: Project[];
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Projects',
        href: index().url,
    },
];

export default function ProjectsIndex({ projects }: Props) {
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Projects" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Projects</h1>
                        <p className="text-muted-foreground text-sm">
                            Manage your Docker Compose projects
                        </p>
                    </div>
                    <Button onClick={() => setIsAddDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Project
                    </Button>
                </div>

                {projects.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed p-8">
                        <div className="text-center">
                            <h3 className="text-lg font-medium">No projects found</h3>
                            <p className="text-muted-foreground mt-1 text-sm">
                                Add a project manually or configure scan directories.
                            </p>
                            <Button className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Project
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {projects.map((project) => (
                            <ProjectCard key={project.path} project={project} />
                        ))}
                    </div>
                )}
            </div>

            <AddProjectDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
        </AppLayout>
    );
}
