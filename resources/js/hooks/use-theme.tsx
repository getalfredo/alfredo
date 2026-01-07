import { useCallback, useEffect, useState } from 'react';

export type Theme = 'default' | 'ocean' | 'forest' | 'sunset';

export const themes: { value: Theme; label: string }[] = [
    { value: 'default', label: 'Default' },
    { value: 'ocean', label: 'Ocean' },
    { value: 'forest', label: 'Forest' },
    { value: 'sunset', label: 'Sunset' },
];

const setCookie = (name: string, value: string, days = 365) => {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const applyThemePreset = (theme: Theme) => {
    document.documentElement.setAttribute('data-theme', theme);
};

export function initializeThemePreset() {
    const savedTheme = (localStorage.getItem('theme') as Theme) || 'default';
    applyThemePreset(savedTheme);
}

export function useTheme() {
    const [theme, setTheme] = useState<Theme>('default');

    const updateTheme = useCallback((newTheme: Theme) => {
        setTheme(newTheme);

        // Store in localStorage for client-side persistence...
        localStorage.setItem('theme', newTheme);

        // Store in cookie for SSR...
        setCookie('theme', newTheme);

        applyThemePreset(newTheme);
    }, []);

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as Theme | null;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        updateTheme(savedTheme || 'default');
    }, [updateTheme]);

    return { theme, updateTheme } as const;
}
