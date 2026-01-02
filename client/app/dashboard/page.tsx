'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Tabs,
  Tab,
  Stack,
  CircularProgress,
  Alert,
  Fab,
} from '@mui/material';
import { Add as AddIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import JobCard from '@/components/JobCard';
import CrawlForm from '@/components/CrawlForm';
import { getJobs, JobListItem } from '@/lib/api';

type TabValue = 'all' | 'running' | 'completed' | 'failed';

export default function DashboardPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const status = tab === 'all' ? undefined : tab;
      const result = await getJobs(page, 20, status);
      setJobs(result.jobs);
      setTotal(result.pagination.total);
    } catch (err) {
      setError('Failed to load jobs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    fetchJobs();

    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: TabValue) => {
    setTab(newValue);
    setPage(1);
  };

  const handleJobCreated = (jobId: string) => {
    router.push(`/dashboard/${jobId}`);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="xl">
        {/* Header */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          mb={4}
        >
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Crawl Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Monitor and manage your web crawling jobs
            </Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchJobs}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setShowForm(true)}
            >
              New Crawl
            </Button>
          </Stack>
        </Stack>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={tab} onChange={handleTabChange}>
            <Tab label="All Jobs" value="all" />
            <Tab label="Running" value="running" />
            <Tab label="Completed" value="completed" />
            <Tab label="Failed" value="failed" />
          </Tabs>
        </Box>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Loading */}
        {loading && jobs.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Empty State */}
        {!loading && jobs.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No crawl jobs found
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Start a new crawl to see it here
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setShowForm(true)}
            >
              Start New Crawl
            </Button>
          </Box>
        )}

        {/* Job Grid */}
        {jobs.length > 0 && (
          <>
            <Grid container spacing={3}>
              {jobs.map((job) => (
                <Grid item xs={12} sm={6} md={4} key={job.id}>
                  <JobCard job={job} onUpdate={fetchJobs} />
                </Grid>
              ))}
            </Grid>

            {/* Pagination info */}
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 3, textAlign: 'center' }}
            >
              Showing {jobs.length} of {total} jobs
            </Typography>
          </>
        )}
      </Container>

      {/* FAB for mobile */}
      <Fab
        color="primary"
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          display: { xs: 'flex', sm: 'none' },
        }}
        onClick={() => setShowForm(true)}
      >
        <AddIcon />
      </Fab>

      {/* Crawl Form */}
      <CrawlForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={handleJobCreated}
      />
    </Box>
  );
}
