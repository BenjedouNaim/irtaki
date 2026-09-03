import React from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar, TabBarItem, TAB_BAR_ITEMS } from '@/shared/components/TabBar';

export type AssistantTabKey = 'home' | 'join-requests' | 'payments';

/**
 * Figma TabBar.Role=Assistant — Home · Join Requests · Payments. The
 * Payments tab (SCR-20/21) is not built yet, so it stays inert (UF §23
 * "Assistant with no groups — both tabs" still lists it).
 */
export const ASSISTANT_TAB_ITEMS: TabBarItem[] = TAB_BAR_ITEMS.assistant.map(
  (item) => (item.key === 'payments' ? { ...item, disabled: true } : item),
);

export interface AssistantTabBarProps {
  activeKey: AssistantTabKey;
  testID?: string;
}

/**
 * Bottom tabs shared by SCR-17 (Home) and SCR-18 (Join Requests Queue).
 * Home is the Assistant root route; the queue is pushed on top of it, so
 * returning "Home" pops when possible (UF §31 stack returns rightward).
 */
export function AssistantTabBar({
  activeKey,
  testID = 'assistant-tab-bar',
}: AssistantTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleSelect = (key: string) => {
    if (key === activeKey) return;
    if (key === 'home') {
      if (router.canGoBack?.()) {
        router.back();
      } else {
        router.replace('/(app)/assistant');
      }
    } else if (key === 'join-requests') {
      router.push('/(app)/assistant/join-requests');
    }
  };

  return (
    <TabBar
      role="assistant"
      items={ASSISTANT_TAB_ITEMS}
      activeKey={activeKey}
      onSelect={handleSelect}
      bottomInset={insets.bottom > 0 ? insets.bottom : 12}
      testID={testID}
    />
  );
}
