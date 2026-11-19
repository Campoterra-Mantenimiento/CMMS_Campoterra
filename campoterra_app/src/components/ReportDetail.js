import React from 'react';
import { ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const STATES = {
  synced: { label: 'Enviado', title: 'Sincronizado con el servidor', message: 'Este reporte ya fue enviado correctamente.', icon: 'checkmark-circle', color: '#15803d', background: '#dcfce7' },
  pending: { label: 'Pendiente', title: 'Guardado en este dispositivo', message: 'El reporte está pendiente de envío. Se sincronizará con una sesión activa y conexión disponible.', icon: 'cloud-upload-outline', color: '#0369a1', background: '#e0f2fe' },
  syncing: { label: 'Enviando', title: 'Enviando al servidor', message: 'Tu captura sigue guardada mientras se confirma el envío.', icon: 'cloud-upload-outline', color: '#0369a1', background: '#e0f2fe' },
  error: { label: 'Con error', title: 'El envío necesita revisión', message: 'El reporte permanece guardado. Revisa el error antes de reintentar.', icon: 'alert-circle', color: '#9a3412', background: '#ffedd5' },
};
const dateLabel = value => new Date(value).toLocaleString('es-MX', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const nameFor = (items, field, id, fallback) => items.find(item => String(item[field]) === String(id))?.nombre || fallback;

function InfoRow({ icon, label, value, last, stacked }) {
  return <View style={styles.infoRow}>
    <View style={styles.infoIcon}><Ionicons name={icon} size={23} color="#526174" /></View>
    <View style={[styles.infoText, !last && styles.separator, stacked && styles.stacked]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>;
}

export default function ReportDetail({ report, catalogs, onClose, onRetry, onLogin, retrying }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 390 || fontScale > 1.15;
  const payload = report.payload;
  const state = STATES[report.status] || { label: 'Sin confirmar', title: 'Estado no disponible', message: 'Consulta de nuevo el historial.', icon: 'help-circle-outline', color: '#475569', background: '#e2e8f0' };
  const corrective = payload.tipo_trabajo === 'correctivo';
  const workType = corrective ? 'Correctivo' : payload.tipo_trabajo === 'preventivo' ? 'Preventivo' : payload.tipo_trabajo || 'Mantenimiento';
  const area = nameFor(catalogs.areas, 'id_area', payload.area_id, `Área #${payload.area_id}`);
  const equipment = payload.equipo_id ? nameFor(catalogs.equipos, 'id_equipo', payload.equipo_id, `Equipo #${payload.equipo_id}`) : 'Sin maquinaria asociada';
  const parts = Array.isArray(payload.piezas) ? payload.piezas : [];
  const disabled = retrying || report.status === 'syncing';

  return <SafeAreaProvider>
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ImageBackground source={require('../../assets/images/fondo_home.png')} resizeMode="cover" style={styles.hero}>
          <View style={styles.heroTint} />
          <SafeAreaView edges={['top', 'left', 'right']} style={styles.heroSafe}>
            <View style={styles.heroContent}>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Volver a mis reportes" style={styles.back}>
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.title}>Detalle del reporte</Text>
              <Text style={styles.subtitle}>Reporte local #{report.id}</Text>
            </View>
          </SafeAreaView>
        </ImageBackground>
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.contentSafe}>
          <View style={styles.content}>
            <View style={[styles.summary, styles.shadow]}>
              <View style={styles.reportIcon}><MaterialCommunityIcons name="clipboard-text-outline" size={32} color="#0284c7" /></View>
              <View style={styles.summaryText}>
                <Text style={styles.area}>{area}</Text>
                <View style={[styles.typeBadge, corrective && styles.correctiveBadge]}>
                  <MaterialCommunityIcons name="tools" size={18} color={corrective ? '#c2410c' : '#0284c7'} />
                  <Text style={[styles.typeText, corrective && { color: '#c2410c' }]}>{workType}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: state.background }]}>
                <Ionicons name={state.icon} size={19} color={state.color} />
                <Text style={[styles.statusText, { color: state.color }]}>{state.label}</Text>
              </View>
            </View>

            <Text style={styles.section}>Información general</Text>
            <View style={[styles.infoCard, styles.shadow]}>
              <InfoRow icon="settings-outline" label="Maquinaria" value={equipment} stacked={compact} />
              <InfoRow icon="time-outline" label="Capturado" value={dateLabel(report.created_at)} stacked={compact} />
              <InfoRow icon="calendar-outline" label="Actualizado" value={dateLabel(report.updated_at)} stacked={compact} last />
            </View>

            <Text style={styles.section}>Descripción</Text>
            <View style={styles.descriptionCard}>
              <View style={styles.descriptionIcon}><Ionicons name="document-text-outline" size={25} color="#0369a1" /></View>
              <View style={styles.grow}>
                <Text style={styles.descriptionLabel}>Descripción del mantenimiento</Text>
                <Text style={styles.description}>{payload.descripcion || 'Sin descripción registrada'}</Text>
              </View>
            </View>

            <Text style={styles.section}>Piezas utilizadas</Text>
            {parts.length ? parts.map((part, index) => <View key={`${part.partId}-${index}`} style={[styles.partCard, styles.shadow]}>
              <View style={styles.partIcon}><Ionicons name="cog-outline" size={25} color="#166534" /></View>
              <Text style={styles.partName}>{nameFor(catalogs.piezas, 'id_pieza', part.partId, `Pieza #${part.partId}`)}</Text>
              <Text style={styles.quantity}>× {part.qty}</Text>
            </View>) : <View style={styles.partCard}>
              <Ionicons name="cube-outline" size={25} color="#64748b" /><Text style={styles.noParts}>Sin piezas registradas en este reporte.</Text>
            </View>}

            <View style={[styles.syncCard, { backgroundColor: state.background }]}>
              <Ionicons name={state.icon} size={35} color={state.color} />
              <View style={styles.grow}>
                <Text style={styles.syncTitle} accessibilityLiveRegion="polite">{state.title}</Text>
                <Text style={styles.syncMessage}>{report.status === 'error' ? report.last_error || state.message : state.message}</Text>
                {report.status === 'error' && report.attempts >= 5 ? <Text style={styles.syncMessage}>Se pausaron los intentos automáticos. Puedes reintentar manualmente.</Text> : null}
              </View>
            </View>
            {report.status === 'error' && report.error_kind === 'auth' ? <TouchableOpacity style={styles.loginButton} accessibilityRole="button" onPress={onLogin}>
              <Text style={styles.loginText}>Iniciar jornada nuevamente</Text>
            </TouchableOpacity> : null}
            {['pending', 'error', 'syncing'].includes(report.status) ? <TouchableOpacity
              style={[styles.retryButton, disabled && styles.disabled]} accessibilityRole="button" disabled={disabled}
              accessibilityState={{ disabled }} onPress={() => onRetry(report)}>
              <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
              <Text style={styles.retryText}>{disabled ? 'Enviando…' : 'Reintentar envío'}</Text>
            </TouchableOpacity> : null}
            <Text style={styles.note}>El número local identifica esta captura en el dispositivo; no es el folio del servidor.</Text>
          </View>
        </SafeAreaView>
      </ScrollView>
    </View>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f8fb' }, scroll: { paddingBottom: 12 },
  hero: { backgroundColor: '#102d41' }, heroTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,30,45,0.32)' },
  heroSafe: { paddingBottom: 52 }, heroContent: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 8 },
  back: { padding: 8, marginLeft: -8, alignSelf: 'flex-start', minHeight: 44, minWidth: 44, marginBottom: 10 },
  title: { color: '#fff', fontSize: 29, fontWeight: '800', lineHeight: 36 },
  subtitle: { color: '#b8cad9', fontSize: 16, marginTop: 8 },
  contentSafe: { marginTop: -32 }, content: { paddingHorizontal: 18, width: '100%', maxWidth: 720, alignSelf: 'center' },
  summary: { backgroundColor: '#fff', borderRadius: 20, padding: 18, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  shadow: { shadowColor: '#142a43', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  reportIcon: { padding: 13, backgroundColor: '#e5f5fd', borderRadius: 15 }, summaryText: { flex: 1, minWidth: 130 },
  area: { fontSize: 21, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#e5f5fd', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, alignSelf: 'flex-start' },
  correctiveBadge: { backgroundColor: '#fff0e6' }, typeText: { color: '#0284c7', fontSize: 13, fontWeight: '700', flexShrink: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12 },
  statusText: { fontSize: 13, fontWeight: '700' },
  section: { fontSize: 21, fontWeight: '800', color: '#0f172a', marginTop: 25, marginBottom: 12 },
  infoCard: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { backgroundColor: '#f1f4f8', padding: 9, borderRadius: 11 },
  infoText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 17 },
  separator: { borderBottomWidth: 1, borderBottomColor: '#edf0f5' },
  stacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  infoLabel: { color: '#748092', fontSize: 13, minWidth: 78 },
  infoValue: { color: '#182235', fontSize: 14, lineHeight: 21, flexShrink: 1 },
  grow: { flex: 1, minWidth: 0 },
  descriptionCard: { padding: 16, borderRadius: 16, backgroundColor: '#f0f3f9', flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  descriptionIcon: { padding: 10, borderRadius: 12, backgroundColor: '#e0f2fe' },
  descriptionLabel: { color: '#748092', fontSize: 13, lineHeight: 19 },
  description: { color: '#182235', fontSize: 16, lineHeight: 24, marginTop: 4 },
  partCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 16, backgroundColor: '#fff', marginBottom: 9 },
  partIcon: { backgroundColor: '#e9fbf0', padding: 10, borderRadius: 12 },
  partName: { flex: 1, color: '#0f172a', fontSize: 16, fontWeight: '700' },
  quantity: { backgroundColor: '#f3f5f9', color: '#526174', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, fontSize: 14, flexShrink: 1 },
  noParts: { color: '#64748b', lineHeight: 21, flex: 1 },
  syncCard: { marginTop: 22, borderRadius: 16, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncTitle: { color: '#142135', fontWeight: '800', fontSize: 15, lineHeight: 21 },
  syncMessage: { color: '#475569', fontSize: 13, lineHeight: 20, marginTop: 4 },
  retryButton: { backgroundColor: '#0369a1', borderRadius: 13, padding: 16, marginTop: 14, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 16 }, disabled: { opacity: 0.5 },
  loginButton: { padding: 16, marginTop: 12, alignItems: 'center' }, loginText: { color: '#0369a1', fontWeight: '700' },
  note: { fontSize: 11, color: '#7c8798', textAlign: 'center', lineHeight: 17, marginTop: 17, marginBottom: 12 },
});
