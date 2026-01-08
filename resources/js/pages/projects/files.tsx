import { CodeEditor } from '@/components/projects/code-editor';
import { FileTree } from '@/components/projects/file-tree';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { index } from '@/actions/App/Http/Controllers/Projects/ProjectController';
import { show as showFile, update as updateFile, index as filesIndex } from '@/actions/App/Http/Controllers/Projects/ProjectFileController';
import { type BreadcrumbItem } from '@/types';
import { type Project, type ProjectFile } from '@/types/projects';
import { Head, router } from '@inertiajs/react';
import { Save } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';

interface Props {
    project: Project;
    files: ProjectFile[];
}

export default function ProjectFiles({ project, files }: Props) {
    const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [originalContent, setOriginalContent] = useState<string>('');
    const [language, setLanguage] = useState<string>('plaintext');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Projects',
            href: index().url,
        },
        {
            title: project.name,
            href: `/projects/${project.encoded_path}`,
        },
        {
            title: 'Files',
            href: filesIndex(project.encoded_path).url,
        },
    ];

    const loadFile = useCallback(async (file: ProjectFile) => {
        setIsLoading(true);
        try {
            const response = await fetch(showFile(project.encoded_path, file.path).url);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            setSelectedFile(file);
            setFileContent(data.content);
            setOriginalContent(data.content);
            setLanguage(data.language);
        } catch (error) {
            console.error('Failed to load file:', error);
        } finally {
            setIsLoading(false);
        }
    }, [project.encoded_path]);

    const handleSave = useCallback(async () => {
        if (!selectedFile) return;

        setIsSaving(true);
        try {
            const response = await fetch(updateFile(project.encoded_path, selectedFile.path).url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '',
                },
                body: JSON.stringify({ content: fileContent }),
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            setOriginalContent(fileContent);
        } catch (error) {
            console.error('Failed to save file:', error);
        } finally {
            setIsSaving(false);
        }
    }, [project.encoded_path, selectedFile, fileContent]);

    const hasChanges = fileContent !== originalContent;

    useEffect(() => {
        if (files.length > 0 && !selectedFile) {
            loadFile(files[0]);
        }
    }, [files, selectedFile, loadFile]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Files - ${project.name}`} />

            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Files</h1>
                        <p className="text-muted-foreground text-sm">
                            Edit configuration files for {project.name}
                        </p>
                    </div>
                    {selectedFile && (
                        <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                            <Save className="mr-2 h-4 w-4" />
                            {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                    )}
                </div>

                <div className="grid flex-1 gap-4 lg:grid-cols-[250px_1fr]">
                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm">Files</CardTitle>
                        </CardHeader>
                        <CardContent className="p-2">
                            <FileTree
                                files={files}
                                selectedFile={selectedFile}
                                onSelectFile={loadFile}
                            />
                        </CardContent>
                    </Card>

                    <Card className="flex flex-col">
                        <CardHeader className="py-3">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                {selectedFile?.path || 'No file selected'}
                                {hasChanges && (
                                    <span className="text-muted-foreground text-xs">(modified)</span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 p-0">
                            {isLoading ? (
                                <div className="flex h-full items-center justify-center">
                                    <p className="text-muted-foreground">Loading...</p>
                                </div>
                            ) : selectedFile ? (
                                <CodeEditor
                                    value={fileContent}
                                    language={language}
                                    onChange={setFileContent}
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center">
                                    <p className="text-muted-foreground">Select a file to edit</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
