import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SheetHandle } from '../SheetHandle';

describe('SheetHandle (Figma 14:102)', () => {
  it('renders a decorative grab bar hidden from assistive technology', () => {
    render(<SheetHandle />);
    const handle = screen.getByTestId('sheet-handle', {
      includeHiddenElements: true,
    });
    expect(handle.props.accessible).toBe(false);
    expect(handle.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
