import React from 'react';
import { View, Text } from 'react-native';

export function StudentTabs() {
  return (
    <View
      className="flex-1 items-center justify-center p-4 bg-white dark:bg-gray-950"
      testID="student-tabs"
    >
      <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
        شاشة الطالب (الرئيسية · التقدم · الاشتراكات)
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400">
        Student Tabs Stub
      </Text>
    </View>
  );
}
