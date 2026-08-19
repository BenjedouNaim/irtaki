import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function AdminStack() {
  return (
    <View style={styles.container} testID="admin-stack">
      <Text style={styles.title}>
        شاشة الإدارة (المجموعات · الكادر · سجل التدقيق)
      </Text>
      <Text style={styles.subtitle}>Admin Stack Stub</Text>
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
