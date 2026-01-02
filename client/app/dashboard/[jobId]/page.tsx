'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Divider,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  ArrowBack,
  Pause,
  PlayArrow,
  Stop,
  Download,
  Refresh,
  Speed,
  Schedule,
  Layers,
} from '@mui/icons-material';
import StatusChip from '@/components/StatusChip';
import ProgressBar from '@/components/ProgressBar';
import PagesTable from '@/components/PagesTable';
import {
  getJob,
  getPages,
  cancelJob,
  pauseJob,
  resumeJob,
  getExportUrl,
  CrawlJob,
  CrawledPage,
} from '@/lib/api';

type TabValue = 'all' | 'completed' | 'failed' | 'pending';

function formatDuration(ms: number | null): string {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatRate(rate: number | null): string {
  if (!rate) return '-';
  return `${rate.toLocaleString()} pages/hr`;
}

export default function JobDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [job, setJob] = useState<CrawlJob | null>(null);
  const [pages, setPages] = useState<CrawledPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(0);

  const fetchJob = useCallback(async () => {
    try {
      const data = await getJob(jobId);
      setJob(data);
      setError(null);
    } catch (err) {
      setError('Failed to load job details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const fetchPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const status = tab === 'all' ? undefined : tab;
      const data = await getPages(jobId, page, pageSize, status);
      setPages(data.pages);
      setTotalPages(data.pagination.total);
    } catch (err) {
      console.error('Failed to load pages:', err);
    } finally {
      setPagesLoading(false);
    }
  }, [jobId, page, pageSize, tab]);

  useEffect(() => {
    fetchJob();
    fetchPages();

    // Auto-refresh for active jobs
    const interval = setInterval(() => {
      if (job?.status === 'running' || job?.status === 'pending') {
        fetchJob();
        fetchPages();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchJob, fetchPages, job?.status]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const handlePause = async () => {
    try {
      await pauseJob(jobId);
      fetchJob();
    } catch (err) {
      console.error('Failed to pause job:', err);
    }
  };

  const handleResume = async () => {
    try {
      await resumeJob(jobId);
      fetchJob();
    } catch (err) {
      console.error('Failed to resume job:', err);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this job?')) return;

    try {
      await cancelJob(jobId);
      fetchJob();
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  const handleExport = (format: 'json' | 'csv') => {
    window.open(getExportUrl(jobId, format), '_blank');
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: TabValue) => {
    setTab(newValue);
    setPage(1);
  };

  const handlePageChange = (newPage: number, newPageSize: number) => {
    setPage(newPage);
    setPageSize(newPageSize);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !job) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error || 'Job not found'}</Alert>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => router.push('/dashboard')}
          sx={{ mt: 2 }}
        >
          Back to Dashboard
        </Button>
      </Container>
    );
  }

  const isActive = job.status === 'running' || job.status === 'paused';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="xl">
        {/* Header */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          mb={4}
        >
          <Box>
            <Button
              startIcon={<ArrowBack />}
              onClick={() => router.push('/dashboard')}
              sx={{ mb: 1 }}
            >
              Back to Dashboard
            </Button>
            <Typography variant="h4" fontWeight="bold">
              {job.domain}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
              {job.seedUrl}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <StatusChip status={job.status} size="medium" />
            <Tooltip title="Refresh">
              <IconButton onClick={fetchJob}>
                <Refresh />
              </IconButton>
            </Tooltip>
            {job.status === 'running' && (
              <Tooltip title="Pause">
                <IconButton onClick={handlePause}>
                  <Pause />
                </IconButton>
              </Tooltip>
            )}
            {job.status === 'paused' && (
              <Tooltip title="Resume">
                <IconButton onClick={handleResume} color="primary">
                  <PlayArrow />
                </IconButton>
              </Tooltip>
            )}
            {isActive && (
              <Tooltip title="Cancel">
                <IconButton onClick={handleCancel} color="error">
                  <Stop />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        {/* Stats Cards */}
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Progress
                </Typography>
                <ProgressBar progress={job.progress} showDetails={true} />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Statistics
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Speed color="primary" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Crawl Rate
                        </Typography>
                        <Typography variant="h6">
                          {formatRate(job.progress.crawlRate)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                  <Grid item xs={4}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Schedule color="primary" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          ETA
                        </Typography>
                        <Typography variant="h6">
                          {job.progress.eta
                            ? new Date(job.progress.eta).toLocaleTimeString()
                            : '-'}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                  <Grid item xs={4}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Layers color="primary" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Queue
                        </Typography>
                        <Typography variant="h6">
                          {job.queue.pending.toLocaleString()}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Configuration */}
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Configuration
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Max Depth
                </Typography>
                <Typography>{job.config.maxDepth}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Max Pages
                </Typography>
                <Typography>{job.config.maxPages.toLocaleString()}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Workers
                </Typography>
                <Typography>{job.config.maxConcurrentWorkers}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body2" color="text.secondary">
                  Crawl Delay
                </Typography>
                <Typography>{job.config.crawlDelayMs}ms</Typography>
              </Grid>
            </Grid>
            {(job.config.includePatterns.length > 0 ||
              job.config.excludePatterns.length > 0) && (
              <>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={2}>
                  {job.config.includePatterns.length > 0 && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Include Patterns
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        {job.config.includePatterns.map((p, i) => (
                          <Chip key={i} label={p} size="small" />
                        ))}
                      </Stack>
                    </Grid>
                  )}
                  {job.config.excludePatterns.length > 0 && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Exclude Patterns
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        {job.config.excludePatterns.map((p, i) => (
                          <Chip key={i} label={p} size="small" />
                        ))}
                      </Stack>
                    </Grid>
                  )}
                </Grid>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pages Table */}
        <Card>
          <CardContent>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={2}
            >
              <Typography variant="h6">
                Crawled Pages ({totalPages.toLocaleString()})
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  startIcon={<Download />}
                  onClick={() => handleExport('csv')}
                  disabled={totalPages === 0}
                >
                  Export CSV
                </Button>
                <Button
                  size="small"
                  startIcon={<Download />}
                  onClick={() => handleExport('json')}
                  disabled={totalPages === 0}
                >
                  Export JSON
                </Button>
              </Stack>
            </Stack>

            <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 2 }}>
              <Tab label="All" value="all" />
              <Tab label="Completed" value="completed" />
              <Tab label="Failed" value="failed" />
              <Tab label="Pending" value="pending" />
            </Tabs>

            <PagesTable
              pages={pages}
              total={totalPages}
              page={page}
              pageSize={pageSize}
              loading={pagesLoading}
              onPageChange={handlePageChange}
            />
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
