'use client';

import { Box, LinearProgress, Typography, Stack, Tooltip } from '@mui/material';

interface ProgressBarProps {
  progress: {
    discovered: number;
    crawled: number;
    failed: number;
    skipped: number;
    percent: number;
  };
  showDetails?: boolean;
}

export default function ProgressBar({ progress, showDetails = true }: ProgressBarProps) {
  const { discovered, crawled, failed, skipped, percent } = progress;

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
        <Box sx={{ flex: 1, mr: 1 }}>
          <Tooltip title={`${crawled.toLocaleString()} of ${discovered.toLocaleString()} pages crawled`}>
            <LinearProgress
              variant="determinate"
              value={percent}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Tooltip>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 45 }}>
          {percent}%
        </Typography>
      </Box>

      {showDetails && (
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <Tooltip title="Total pages discovered">
            <Typography variant="caption" color="text.secondary">
              Discovered: {discovered.toLocaleString()}
            </Typography>
          </Tooltip>
          <Tooltip title="Successfully crawled pages">
            <Typography variant="caption" color="success.main">
              Crawled: {crawled.toLocaleString()}
            </Typography>
          </Tooltip>
          {failed > 0 && (
            <Tooltip title="Failed to crawl">
              <Typography variant="caption" color="error.main">
                Failed: {failed.toLocaleString()}
              </Typography>
            </Tooltip>
          )}
          {skipped > 0 && (
            <Tooltip title="Skipped (robots.txt, pattern filters)">
              <Typography variant="caption" color="warning.main">
                Skipped: {skipped.toLocaleString()}
              </Typography>
            </Tooltip>
          )}
        </Stack>
      )}
    </Box>
  );
}
