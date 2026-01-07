import { Head } from '@inertiajs/react';

import AppearanceTabs from '@/components/appearance-tabs';
import HeadingSmall from '@/components/heading-small';
import ThemeSelector from '@/components/theme-selector';
import { Separator } from '@/components/ui/separator';
import { type BreadcrumbItem } from '@/types';

import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { edit as editAppearance } from '@/routes/appearance';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Appearance settings',
        href: editAppearance().url,
    },
];

export default function Appearance() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Appearance settings" />

            <SettingsLayout>
                <div className="space-y-6">
                    <HeadingSmall
                        title="Appearance settings"
                        description="Update your account's appearance settings"
                    />

                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">Mode</h4>
                        <AppearanceTabs />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">Theme</h4>
                        <p className="text-sm text-muted-foreground">
                            Choose a color theme for the interface
                        </p>
                        <ThemeSelector className="mt-3" />
                    </div>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
