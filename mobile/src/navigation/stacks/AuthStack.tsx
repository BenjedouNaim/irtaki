import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function AuthStack() {
  return (
    <View style={styles.container} testID="auth-stack">
      <Text style={styles.title}>شاشة تسجيل الدخول</Text>
      <Text style={styles.subtitle}>Auth Stack Stub</Text>
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
