import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import NewReportScreen from './src/screens/NewReportScreen';
import MyReportsScreen from './src/screens/MyReportsScreen';
import DeviceGate from './src/components/DeviceGate';
import { USE_SUPABASE } from './src/services/backendConfig';

const Stack = createNativeStackNavigator();

export default function App() {
  const Gate = USE_SUPABASE ? DeviceGate : React.Fragment;
  return (
    <SafeAreaProvider>
    <Gate>
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="NewReport" component={NewReportScreen} />
        <Stack.Screen name="MyReports" component={MyReportsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
    </Gate>
    </SafeAreaProvider>
  );
}
