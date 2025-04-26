<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum TaskStatus: string implements HasLabel
{
    case Pending = 'pending';
    case Running = 'running';
    case Completed = 'completed';
    case Cancelled = 'cancelled';
    case Failed = 'failed';
    case Timeout = 'timeout';

    public function getLabel(): ?string
    {
        return match ($this) {
            self::Pending => 'Pending',
            self::Running => 'Running',
            self::Completed => 'Completed',
            self::Failed => 'Failed',
            self::Timeout => 'Timeout',
            self::Cancelled => 'Cancelled',
        };
    }
}
