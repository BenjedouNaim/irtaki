import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TopBar } from '../TopBar';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }));

describe('TopBar (Figma 10:39)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Back=true: centred heading/md title and a labelled round back control', () => {
    render(<TopBar title="العنوان" />);

    const title = screen.getByTestId('top-bar-title');
    expect(title.props.children).toBe('العنوان');
    expect(title.props.className).toContain('text-heading-md');
    expect(title.props.className).toContain('text-center');

    const control = screen.getByLabelText('رجوع');
    expect(control.props.accessibilityRole).toBe('button');
    expect(control.props.hitSlop).toEqual({
      top: 4,
      bottom: 4,
      left: 4,
      right: 4,
    });
    fireEvent.press(control);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('calls onBack instead of the router when given', () => {
    const onBack = jest.fn();
    render(<TopBar title="x" onBack={onBack} />);
    fireEvent.press(screen.getByTestId('top-bar-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('Back=false: right-aligned heading/lg title, no back control, optional trailing slot', () => {
    render(
      <TopBar title="الرئيسية" back={false} trailing={<Text>bell</Text>} />,
    );

    const title = screen.getByTestId('top-bar-title');
    expect(title.props.className).toContain('text-heading-lg');
    expect(title.props.className).toContain('text-right');
    expect(screen.queryByTestId('top-bar-back')).toBeNull();
    expect(screen.getByTestId('top-bar-trailing')).toBeTruthy();
    expect(screen.getByText('bell')).toBeTruthy();
  });
});
