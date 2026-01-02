'use client';

import { useState, useCallback } from 'react';
import {
  DataGrid,
  GridColDef,
  GridPaginationModel,
  GridRenderCellParams,
} from '@mui/x-data-grid';
import { Box, Chip, Typography, Tooltip, Link } from '@mui/material';
import { CrawledPage } from '@/lib/api';

interface PagesTableProps {
  pages: CrawledPage[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number, pageSize: number) => void;
}

const statusColors: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  pending: 'default',
  crawling: 'primary',
  completed: 'success',
  failed: 'error',
  skipped: 'warning',
};

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatUrl(url: string, maxLength = 50): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '...';
}

const columns: GridColDef[] = [
  {
    field: 'url',
    headerName: 'URL',
    flex: 2,
    minWidth: 300,
    renderCell: (params: GridRenderCellParams<CrawledPage>) => (
      <Tooltip title={params.row.url}>
        <Link
          href={params.row.url}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ textDecoration: 'none' }}
        >
          {formatUrl(params.row.url)}
        </Link>
      </Tooltip>
    ),
  },
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 200,
    renderCell: (params: GridRenderCellParams<CrawledPage>) => (
      <Tooltip title={params.row.title || ''}>
        <Typography variant="body2" noWrap>
          {params.row.title || '-'}
        </Typography>
      </Tooltip>
    ),
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: (params: GridRenderCellParams<CrawledPage>) => (
      <Chip
        label={params.row.status}
        color={statusColors[params.row.status] || 'default'}
        size="small"
      />
    ),
  },
  {
    field: 'httpStatus',
    headerName: 'HTTP',
    width: 80,
    renderCell: (params: GridRenderCellParams<CrawledPage>) => {
      const status = params.row.httpStatus;
      if (!status) return '-';

      let color = 'inherit';
      if (status >= 200 && status < 300) color = 'success.main';
      else if (status >= 300 && status < 400) color = 'info.main';
      else if (status >= 400) color = 'error.main';

      return (
        <Typography variant="body2" color={color}>
          {status}
        </Typography>
      );
    },
  },
  {
    field: 'depth',
    headerName: 'Depth',
    width: 80,
    type: 'number',
  },
  {
    field: 'linksFound',
    headerName: 'Links',
    width: 80,
    type: 'number',
  },
  {
    field: 'durationMs',
    headerName: 'Duration',
    width: 100,
    renderCell: (params: GridRenderCellParams<CrawledPage>) => (
      <Typography variant="body2">
        {formatDuration(params.row.durationMs)}
      </Typography>
    ),
  },
  {
    field: 'crawledAt',
    headerName: 'Crawled At',
    width: 160,
    renderCell: (params: GridRenderCellParams<CrawledPage>) => {
      if (!params.row.crawledAt) return '-';
      return new Date(params.row.crawledAt).toLocaleString();
    },
  },
  {
    field: 'errorMessage',
    headerName: 'Error',
    width: 200,
    renderCell: (params: GridRenderCellParams<CrawledPage>) => {
      if (!params.row.errorMessage) return '-';
      return (
        <Tooltip title={params.row.errorMessage}>
          <Typography variant="body2" color="error" noWrap>
            {params.row.errorMessage}
          </Typography>
        </Tooltip>
      );
    },
  },
];

export default function PagesTable({
  pages,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
}: PagesTableProps) {
  const handlePaginationModelChange = useCallback(
    (model: GridPaginationModel) => {
      onPageChange(model.page + 1, model.pageSize);
    },
    [onPageChange]
  );

  return (
    <Box sx={{ height: 600, width: '100%' }}>
      <DataGrid
        rows={pages}
        columns={columns}
        loading={loading}
        paginationMode="server"
        rowCount={total}
        paginationModel={{
          page: page - 1,
          pageSize,
        }}
        onPaginationModelChange={handlePaginationModelChange}
        pageSizeOptions={[25, 50, 100]}
        disableRowSelectionOnClick
        getRowId={(row) => row.id}
        sx={{
          '& .MuiDataGrid-cell': {
            py: 1,
          },
        }}
      />
    </Box>
  );
}
