import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SkeletonLoader } from '../SkeletonLoader';

describe('SkeletonLoader', () => {
  it('renders row skeletons with specified count', async () => {
    await render(
      <SkeletonLoader variant="row" count={3} testID="custom-skeleton" />,
    );

    expect(screen.getByTestId('custom-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-row-0')).toBeTruthy();
    expect(screen.getByTestId('skeleton-row-1')).toBeTruthy();
    expect(screen.getByTestId('skeleton-row-2')).toBeTruthy();
  });

  it('renders dashboard variant', async () => {
    await render(
      <SkeletonLoader variant="dashboard" testID="dashboard-skeleton" />,
    );

    expect(screen.getByTestId('dashboard-skeleton')).toBeTruthy();
  });

  it('renders ring variant as a circular placeholder plus text lines (UF §22)', async () => {
    await render(<SkeletonLoader variant="ring" testID="ring-skeleton" />);

    expect(screen.getByTestId('ring-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-ring-title')).toBeTruthy();
    expect(screen.getByTestId('skeleton-ring-circle')).toBeTruthy();
    expect(screen.getByTestId('skeleton-ring-line-0')).toBeTruthy();
    expect(screen.getByTestId('skeleton-ring-line-1')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-row-0')).toBeNull();
  });

  it('renders card variant as badge, title, text line and a 48dp button block (UF §22)', async () => {
    await render(<SkeletonLoader variant="card" testID="card-skeleton" />);

    expect(screen.getByTestId('card-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-card-badge')).toBeTruthy();
    expect(screen.getByTestId('skeleton-card-title')).toBeTruthy();
    expect(screen.getByTestId('skeleton-card-line')).toBeTruthy();
    expect(screen.getByTestId('skeleton-card-button')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-row-0')).toBeNull();
  });

  it('renders reportRow variant as N history rows with two text lines and a type pill (UF §22)', async () => {
    await render(
      <SkeletonLoader
        variant="reportRow"
        count={3}
        testID="history-skeleton"
      />,
    );

    expect(screen.getByTestId('history-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-report-row-0')).toBeTruthy();
    expect(screen.getByTestId('skeleton-report-row-2')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-report-row-3')).toBeNull();
    expect(screen.queryByTestId('skeleton-row-0')).toBeNull();
  });

  it('renders metricRow variant as N label/value rows matching the Weekly Report layout (UF §22, §29)', async () => {
    await render(
      <SkeletonLoader variant="metricRow" count={6} testID="weekly-skeleton" />,
    );

    expect(screen.getByTestId('weekly-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-metric-row-0')).toBeTruthy();
    expect(screen.getByTestId('skeleton-metric-row-5')).toBeTruthy();
    expect(screen.queryByTestId('skeleton-metric-row-6')).toBeNull();
    expect(screen.queryByTestId('skeleton-report-row-0')).toBeNull();
  });
});
