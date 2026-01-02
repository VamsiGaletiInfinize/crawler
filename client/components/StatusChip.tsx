'use client';

import { Chip, ChipProps } from '@mui/material';
import {
  HourglassEmpty,
  PlayArrow,
  Pause,
  CheckCircle,
  Error,
  Cancel,
} from '@mui/icons-material';

type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

interface StatusChipProps {
  status: JobStatus | string;
  size?: 'small' | 'medium';
}

const statusConfig: Record<
  JobStatus,
  { label: string; color: ChipProps['color']; icon: React.ReactElement }
> = {
  pending: {
    label: 'Pending',
    color: 'default',
    icon: <HourglassEmpty fontSize="small" />,
  },
  running: {
    label: 'Running',
    color: 'primary',
    icon: <PlayArrow fontSize="small" />,
  },
  paused: {
    label: 'Paused',
    color: 'warning',
    icon: <Pause fontSize="small" />,
  },
  completed: {
    label: 'Completed',
    color: 'success',
    icon: <CheckCircle fontSize="small" />,
  },
  failed: {
    label: 'Failed',
    color: 'error',
    icon: <Error fontSize="small" />,
  },
  cancelled: {
    label: 'Cancelled',
    color: 'default',
    icon: <Cancel fontSize="small" />,
  },
};

export default function StatusChip({ status, size = 'small' }: StatusChipProps) {
  const config = statusConfig[status as JobStatus] || statusConfig.pending;

  return (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      icon={config.icon}
      sx={{ fontWeight: 500 }}
    />
  );
}
