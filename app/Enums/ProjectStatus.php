<?php

namespace App\Enums;

enum ProjectStatus: string
{
    case Unknown = 'unknown';
    case Running = 'running';
    case Stopped = 'stopped';
    case Partial = 'partial';

    public function label(): string
    {
        return match ($this) {
            self::Unknown => 'Unknown',
            self::Running => 'Running',
            self::Stopped => 'Stopped',
            self::Partial => 'Partial',
        };
    }

    public function color(): string
    {
        return match ($this) {
            self::Unknown => 'gray',
            self::Running => 'green',
            self::Stopped => 'red',
            self::Partial => 'yellow',
        };
    }
}
