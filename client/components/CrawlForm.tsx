'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  FormControlLabel,
  Switch,
  Slider,
  Typography,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { startCrawl, CrawlJobConfig, ApiError } from '@/lib/api';

interface CrawlFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (jobId: string) => void;
}

export default function CrawlForm({ open, onClose, onSuccess }: CrawlFormProps) {
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(10);
  const [maxPages, setMaxPages] = useState(100000);
  const [maxWorkers, setMaxWorkers] = useState(10);
  const [crawlDelay, setCrawlDelay] = useState(1000);
  const [respectRobots, setRespectRobots] = useState(true);
  const [includePatterns, setIncludePatterns] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setError(null);

    const config: CrawlJobConfig = {
      url: url.trim(),
      maxDepth,
      maxPages,
      maxConcurrentWorkers: maxWorkers,
      crawlDelayMs: crawlDelay,
      respectRobotsTxt: respectRobots,
      includePatterns: includePatterns
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p),
      excludePatterns: excludePatterns
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p),
    };

    try {
      const result = await startCrawl(config);
      onSuccess(result.jobId);
      handleClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to start crawl. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setMaxDepth(10);
    setMaxPages(100000);
    setMaxWorkers(10);
    setCrawlDelay(1000);
    setRespectRobots(true);
    setIncludePatterns('');
    setExcludePatterns('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start New Crawl</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            label="Website URL"
            placeholder="https://www.university.edu"
            fullWidth
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            margin="normal"
            required
            disabled={loading}
          />

          <Box sx={{ mt: 3 }}>
            <Typography gutterBottom>
              Max Depth: {maxDepth}
            </Typography>
            <Slider
              value={maxDepth}
              onChange={(_, value) => setMaxDepth(value as number)}
              min={1}
              max={50}
              disabled={loading}
            />
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography gutterBottom>
              Max Pages: {maxPages.toLocaleString()}
            </Typography>
            <Slider
              value={maxPages}
              onChange={(_, value) => setMaxPages(value as number)}
              min={1000}
              max={150000}
              step={1000}
              disabled={loading}
            />
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography gutterBottom>
              Concurrent Workers: {maxWorkers}
            </Typography>
            <Slider
              value={maxWorkers}
              onChange={(_, value) => setMaxWorkers(value as number)}
              min={1}
              max={25}
              disabled={loading}
            />
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography gutterBottom>
              Crawl Delay: {crawlDelay}ms
            </Typography>
            <Slider
              value={crawlDelay}
              onChange={(_, value) => setCrawlDelay(value as number)}
              min={100}
              max={5000}
              step={100}
              disabled={loading}
            />
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={respectRobots}
                onChange={(e) => setRespectRobots(e.target.checked)}
                disabled={loading}
              />
            }
            label="Respect robots.txt"
            sx={{ mt: 2 }}
          />

          <Accordion sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Advanced Options</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                label="Include Patterns (one per line)"
                placeholder="/admissions/.*&#10;/programs/.*"
                fullWidth
                multiline
                rows={3}
                value={includePatterns}
                onChange={(e) => setIncludePatterns(e.target.value)}
                margin="normal"
                disabled={loading}
                helperText="Regex patterns for URLs to include"
              />
              <TextField
                label="Exclude Patterns (one per line)"
                placeholder="/calendar/.*&#10;/events/.*"
                fullWidth
                multiline
                rows={3}
                value={excludePatterns}
                onChange={(e) => setExcludePatterns(e.target.value)}
                margin="normal"
                disabled={loading}
                helperText="Regex patterns for URLs to exclude"
              />
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Starting...' : 'Start Crawl'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
