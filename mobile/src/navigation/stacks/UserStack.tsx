import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function UserStack() {
  return (
    <View style={styles.container} testID="user-stack">
      <Text style={styles.title}>شاشة المستخدم (مقدم طلب)</Text>
      <Text style={styles.subtitle}>User Stack Stub</Text>
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
