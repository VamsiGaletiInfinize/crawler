'use client';

import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box,
  Stack,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  OpenInNew,
  Pause,
  PlayArrow,
  Stop,
} from '@mui/icons-material';
import StatusChip from './StatusChip';
import ProgressBar from './ProgressBar';
import { JobListItem, cancelJob, pauseJob, resumeJob } from '@/lib/api';

interface JobCardProps {
  job: JobListItem;
  onUpdate?: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function formatDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function JobCard({ job, onUpdate }: JobCardProps) {
  const router = useRouter();

  const handleViewDetails = () => {
    router.push(`/dashboard/${job.id}`);
  };

  const handlePause = async () => {
    try {
      await pauseJob(job.id);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to pause job:', error);
    }
  };

  const handleResume = async () => {
    try {
      await resumeJob(job.id);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to resume job:', error);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this job?')) return;

    try {
      await cancelJob(job.id);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const isActive = job.status === 'running' || job.status === 'paused';

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Box>
            <Tooltip title={job.seedUrl}>
              <Typography variant="h6" noWrap sx={{ maxWidth: 250 }}>
                {formatDomain(job.seedUrl)}
              </Typography>
            </Tooltip>
            <Typography variant="caption" color="text.secondary">
              {job.domain}
            </Typography>
          </Box>
          <StatusChip status={job.status} />
        </Stack>

        <ProgressBar progress={job.progress} showDetails={true} />

        <Stack direction="row" spacing={2} mt={2}>
          <Typography variant="caption" color="text.secondary">
            Created: {formatDate(job.createdAt)}
          </Typography>
          {job.startedAt && (
            <Typography variant="caption" color="text.secondary">
              Started: {formatDate(job.startedAt)}
            </Typography>
          )}
        </Stack>
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Box>
          {job.status === 'running' && (
            <Tooltip title="Pause">
              <IconButton size="small" onClick={handlePause}>
                <Pause />
              </IconButton>
            </Tooltip>
          )}
          {job.status === 'paused' && (
            <Tooltip title="Resume">
              <IconButton size="small" onClick={handleResume} color="primary">
                <PlayArrow />
              </IconButton>
            </Tooltip>
          )}
          {isActive && (
            <Tooltip title="Cancel">
              <IconButton size="small" onClick={handleCancel} color="error">
                <Stop />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Button
          size="small"
          endIcon={<OpenInNew />}
          onClick={handleViewDetails}
        >
          View Details
        </Button>
      </CardActions>
    </Card>
  );
}
