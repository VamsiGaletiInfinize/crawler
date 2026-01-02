'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
} from '@mui/material';
import {
  Speed as SpeedIcon,
  Security as SecurityIcon,
  Storage as StorageIcon,
  CloudQueue as CloudIcon,
} from '@mui/icons-material';
import CrawlForm from '@/components/CrawlForm';

const features = [
  {
    icon: <SpeedIcon sx={{ fontSize: 40 }} />,
    title: 'High Performance',
    description: 'Crawl 50k-150k pages with parallel workers and intelligent rate limiting.',
  },
  {
    icon: <SecurityIcon sx={{ fontSize: 40 }} />,
    title: 'Polite & Safe',
    description: 'Respects robots.txt, implements crawl delays, and auto-throttles on 429.',
  },
  {
    icon: <StorageIcon sx={{ fontSize: 40 }} />,
    title: 'Persistent Storage',
    description: 'PostgreSQL for durability, Redis for queue management, resume-safe design.',
  },
  {
    icon: <CloudIcon sx={{ fontSize: 40 }} />,
    title: 'Async Processing',
    description: 'Non-blocking job creation with real-time progress tracking.',
  },
];

export default function HomePage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  const handleJobCreated = (jobId: string) => {
    router.push(`/dashboard/${jobId}`);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
          color: 'white',
          py: 8,
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={4} alignItems="center" textAlign="center">
            <Typography variant="h2" component="h1" fontWeight="bold">
              CrawlScrap
            </Typography>
            <Typography variant="h5" sx={{ opacity: 0.9, maxWidth: 600 }}>
              Production-grade async web crawler for US Higher Education websites
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                color="secondary"
                size="large"
                onClick={() => setShowForm(true)}
              >
                Start New Crawl
              </Button>
              <Button
                variant="outlined"
                size="large"
                sx={{ color: 'white', borderColor: 'white' }}
                onClick={() => router.push('/dashboard')}
              >
                View Dashboard
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" textAlign="center" mb={6}>
          Enterprise-Ready Crawling
        </Typography>
        <Grid container spacing={4}>
          {features.map((feature, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card sx={{ height: '100%', textAlign: 'center', p: 2 }}>
                <CardContent>
                  <Box sx={{ color: 'primary.main', mb: 2 }}>{feature.icon}</Box>
                  <Typography variant="h6" gutterBottom>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Stats Section */}
      <Box sx={{ bgcolor: 'grey.100', py: 6 }}>
        <Container maxWidth="lg">
          <Grid container spacing={4} justifyContent="center">
            <Grid item xs={6} sm={3}>
              <Stack alignItems="center">
                <Typography variant="h3" color="primary" fontWeight="bold">
                  150k+
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Pages per job
                </Typography>
              </Stack>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Stack alignItems="center">
                <Typography variant="h3" color="primary" fontWeight="bold">
                  25
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Concurrent workers
                </Typography>
              </Stack>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Stack alignItems="center">
                <Typography variant="h3" color="primary" fontWeight="bold">
                  60k
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Pages/hour
                </Typography>
              </Stack>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Stack alignItems="center">
                <Typography variant="h3" color="primary" fontWeight="bold">
                  100%
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Resumable
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Crawl Form Dialog */}
      <CrawlForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={handleJobCreated}
      />
    </Box>
  );
}
