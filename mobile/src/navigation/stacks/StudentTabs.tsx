import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function StudentTabs() {
  return (
    <View style={styles.container} testID="student-tabs">
      <Text style={styles.title}>
        شاشة الطالب (الرئيسية · التقدم · الاشتراكات)
      </Text>
      <Text style={styles.subtitle}>Student Tabs Stub</Text>
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
