import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { store } from '@/actions/App/Http/Controllers/Projects/ProjectController';
import { Form } from '@inertiajs/react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddProjectDialog({ open, onOpenChange }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Project</DialogTitle>
                    <DialogDescription>
                        Add a Docker Compose project by providing its path.
                    </DialogDescription>
                </DialogHeader>
                <Form {...store.form()} onSuccess={() => onOpenChange(false)}>
                    {({ errors, processing }) => (
                        <>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="path">Project Path</Label>
                                    <Input
                                        id="path"
                                        name="path"
                                        placeholder="/path/to/project"
                                        className="font-mono"
                                    />
                                    {errors.path && (
                                        <p className="text-destructive text-sm">{errors.path}</p>
                                    )}
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Project Name (optional)</Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        placeholder="My Project"
                                    />
                                    {errors.name && (
                                        <p className="text-destructive text-sm">{errors.name}</p>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={processing}>
                                    {processing ? 'Adding...' : 'Add Project'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}
