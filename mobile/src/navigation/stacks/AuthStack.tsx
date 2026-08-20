import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RegisterScreen } from '../../features/auth/screens/RegisterScreen';

export function AuthStack() {
  const [currentScreen, setCurrentScreen] = useState<'login' | 'register'>(
    'register',
  );

  if (currentScreen === 'register') {
    return (
      <View style={{ flex: 1 }} testID="auth-stack">
        <RegisterScreen onNavigateToLogin={() => setCurrentScreen('login')} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="auth-stack">
      <Text style={styles.title}>شاشة تسجيل الدخول</Text>
      <Text style={styles.subtitle}>Auth Stack Stub</Text>
      <TouchableOpacity
        onPress={() => setCurrentScreen('register')}
        style={styles.linkButton}
        testID="go-to-register-button"
      >
        <Text style={styles.linkText}>ليس لديك حساب؟ إنشاء حساب جديد</Text>
      </TouchableOpacity>
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
    marginBottom: 16,
  },
  linkButton: {
    padding: 12,
  },
  linkText: {
    fontSize: 14,
    color: '#0f766e',
    fontWeight: '700',
  },
});
