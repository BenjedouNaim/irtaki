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
});
