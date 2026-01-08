export type ProjectStatus = 'unknown' | 'running' | 'stopped' | 'partial';

export interface Project {
    path: string;
    encoded_path: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    status_label: string;
    status_color: string;
    is_manual: boolean;
    custom_commands: CustomCommand[];
}

export interface CustomCommand {
    name: string;
    description: string;
    command: string;
}

export interface DockerService {
    name: string;
    status: string;
    image: string;
    ports: string;
}

export interface ProjectFile {
    path: string;
    name: string;
    language: string;
}

export interface CommandEvent {
    type: 'start' | 'output' | 'error' | 'done';
    command?: string;
    data?: string;
    message?: string;
    success?: boolean;
}
