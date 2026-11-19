import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEVICE_ID } from '../services/backendConfig';
import { authorizeDevice, supabase } from '../services/supabase';
import { clearMobileSession } from '../services/api';

export default function DeviceGate({ children }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: failure }) => {
      if (!mounted) return;
      if (failure) setError('No se pudo recuperar la sesión. Verifica la conexión.');
      setReady(data.session?.user?.id === DEVICE_ID);
    }).catch(() => { if (mounted) setError('No se pudo recuperar la sesión del dispositivo.'); })
      .finally(() => { if (mounted) setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) clearMobileSession();
      if (mounted && event !== 'SIGNED_IN') setReady(session?.user?.id === DEVICE_ID);
    });
    supabase.auth.startAutoRefresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); appState.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);
  async function configure() {
    setBusy(true); setError('');
    try { await authorizeDevice(email, password); setPassword(''); setReady(true); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (loading) return <SafeAreaView style={styles.page}><ActivityIndicator /><Text>Preparando dispositivo…</Text></SafeAreaView>;
  if (ready) return children;
  return <SafeAreaView style={styles.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.brand}>CAMPOTERRA</Text>
    <Text style={styles.title}>Configurar tablet</Text>
    <Text style={styles.description}>El encargado configura este dispositivo una vez. Después, cada técnico selecciona su nombre y turno.</Text>
    <Text>Correo de la tablet</Text>
    <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!busy} accessibilityLabel="Correo de la tablet" />
    <Text>Contraseña de configuración</Text>
    <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry editable={!busy} accessibilityLabel="Contraseña de configuración" />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button title={busy ? 'Verificando…' : 'Autorizar dispositivo'} onPress={configure} disabled={busy || !email.trim() || !password} />
    <View style={{ height: 20 }} /><Text style={styles.description}>Usa la cuenta asignada a la tablet. No se guarda la contraseña.</Text>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f4f7fb', justifyContent: 'center' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, maxWidth: 540, width: '100%', alignSelf: 'center' },
  brand: { color: '#147b49', fontWeight: '800', marginBottom: 20 },
  title: { fontSize: 30, fontWeight: '800', color: '#071d38', marginBottom: 14 },
  description: { color: '#536174', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  input: { backgroundColor: 'white', borderColor: '#c7d1df', borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 8, marginBottom: 18, fontSize: 17 },
  error: { color: '#ad2020', marginBottom: 18 },
});
