import { type ProjectFile } from '@/types/projects';
import { cn } from '@/lib/utils';
import { FileCode } from 'lucide-react';

interface Props {
    files: ProjectFile[];
    selectedFile: ProjectFile | null;
    onSelectFile: (file: ProjectFile) => void;
}

export function FileTree({ files, selectedFile, onSelectFile }: Props) {
    if (files.length === 0) {
        return (
            <p className="text-muted-foreground py-4 text-center text-sm">
                No editable files found.
            </p>
        );
    }

    return (
        <div className="space-y-1">
            {files.map((file) => (
                <button
                    key={file.path}
                    onClick={() => onSelectFile(file)}
                    className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                        selectedFile?.path === file.path
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent/50'
                    )}
                >
                    <FileCode className="h-4 w-4 shrink-0" />
                    <span className="truncate">{file.name}</span>
                </button>
            ))}
        </div>
    );
}
