import React, { useState } from 'react';
import { View } from 'react-native';
import { RegisterScreen } from '../../features/auth/screens/RegisterScreen';
import { LoginScreen } from '../../features/auth/screens/LoginScreen';

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
    <View style={{ flex: 1 }} testID="auth-stack">
      <LoginScreen onNavigateToRegister={() => setCurrentScreen('register')} />
    </View>
  );
}
