/**
 * STEP Mobile App - Main Entry Point
 * 
 * Navigation structure:
 * - Tab 1: Map (mining interface)
 * - Tab 2: Balance (wallet and transaction history)
 * 
 * Future tabs: Settings, History, Leaderboard
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import StandaloneMapScreen from './src/screens/StandaloneMapScreen';
import BalanceScreen from './src/screens/BalanceScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#000000',
            borderTopWidth: 2,
            borderTopColor: '#FFFFFF',
            height: 60,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#666666',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        }}
      >
        <Tab.Screen
          name="Map"
          component={StandaloneMapScreen}
          options={{
            tabBarIcon: () => null,
            tabBarLabel: '⛏️ Mine',
          }}
        />
        <Tab.Screen
          name="Balance"
          component={BalanceScreen}
          options={{
            tabBarIcon: () => null,
            tabBarLabel: '💰 Balance',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
