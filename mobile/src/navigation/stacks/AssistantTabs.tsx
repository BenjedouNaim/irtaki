import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function AssistantTabs() {
  return (
    <View style={styles.container} testID="assistant-tabs">
      <Text style={styles.title}>شاشة المساعد (الرئيسية · طلبات الانضمام · المدفوعات)</Text>
      <Text style={styles.subtitle}>Assistant Tabs Stub</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
});
