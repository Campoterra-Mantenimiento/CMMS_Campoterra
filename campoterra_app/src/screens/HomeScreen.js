import React, { useState, useCallback } from 'react';
import { Alert, View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { clearMobileSession } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import { getCachedCatalog, getReportsForTechnician, getPendingReportSummary, subscribeToSync, syncPendingReports } from '../services/offlineSync';

const REPORT_STATES = {
  synced: { icon: 'checkmark-circle', color: '#16a34a', label: 'Enviado' },
  pending: { icon: 'time-outline', color: '#0369a1', label: 'Pendiente' },
  syncing: { icon: 'cloud-upload-outline', color: '#0369a1', label: 'Enviando' },
  error: { icon: 'alert-circle', color: '#c2410c', label: 'Con error' },
};

export default function HomeScreen({ navigation, route }) {
  const { nombreTecnico = 'Técnico', tecnicoId, turnoActivo = 'Sin turno', turnoId } = route?.params || {};
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 380 || fontScale > 1.2;
  const [summary, setSummary] = useState({ pending: 0, errors: 0 });
  const [recent, setRecent] = useState([]);
  const [catalogs, setCatalogs] = useState({ areas: [], equipos: [] });
  const [syncError, setSyncError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(null);
  const [today, setToday] = useState(new Date());

  useFocusEffect(useCallback(() => {
    let active = true;
    let unsubscribe = () => {};
    setToday(new Date());
    const update = (value) => {
      if (!active) return;
      try {
        setSummary(value);
        setRecent(getReportsForTechnician(tecnicoId).slice(0, 4));
        const cached = (name) => {
          const value = getCachedCatalog(name);
          return Array.isArray(value) ? value : [];
        };
        setCatalogs({ areas: cached('areas-mantenimiento'), equipos: cached('equipos') });
        setLoaded(true); setSyncError(false);
      } catch { setSyncError(true); }
    };
    const stopNetwork = NetInfo.addEventListener((state) => {
      if (active) setOnline(state.isConnected == null ? null : !!state.isConnected && state.isInternetReachable !== false);
    });
    try {
      update(getPendingReportSummary());
      unsubscribe = subscribeToSync(update);
      syncPendingReports().then(update).catch(() => { if (active) setSyncError(true); });
    } catch { if (active) setSyncError(true); }
    return () => { active = false; unsubscribe(); stopNetwork(); };
  }, [tecnicoId]));

  const openReports = (initialFilter = 'all', reportId = null) =>
    navigation.navigate('MyReports', { tecnicoId, initialFilter, reportId });
  const showMenu = () => Alert.alert('Mi jornada', `${nombreTecnico} · ${turnoActivo}`, [
    { text: 'Mis reportes', onPress: () => openReports() },
    { text: 'Cerrar sesión', style: 'destructive', onPress: () => { clearMobileSession(); navigation.replace('Login'); } },
    { text: 'Cancelar', style: 'cancel' },
  ]);
  const reportName = (report) => {
    const payload = report.payload;
    const equipment = catalogs.equipos.find(item => String(item.id_equipo) === String(payload.equipo_id));
    const area = catalogs.areas.find(item => String(item.id_area) === String(payload.area_id));
    return equipment?.nombre || area?.nombre || `Área #${payload.area_id}`;
  };
  const pending = Number(summary.pending) || 0;
  const errors = Number(summary.errors) || 0;
  const syncText = syncError ? 'No se pudo consultar el estado. Revisar reportes'
    : errors ? `${errors} con error${pending ? ` · ${pending} pendientes` : ''}. Revisar`
    : pending ? `${pending} ${pending === 1 ? 'reporte pendiente' : 'reportes pendientes'} de envío`
    : loaded ? 'Tus reportes están al día' : 'Consultando reportes…';

  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={showMenu} accessibilityRole="button" accessibilityLabel="Abrir menú de jornada" style={styles.menu}>
            <Ionicons name="menu-outline" size={26} color="#fff" />
          </TouchableOpacity>
          <View style={styles.grow}>
            <Text style={styles.greeting}>Hola, {nombreTecnico} | {turnoActivo}</Text>
            <Text style={styles.date}>{today.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
            {compact ? <Text style={styles.networkSmall}>{online === null ? 'Comprobando red' : online ? 'En línea' : 'Sin conexión'}</Text> : null}
          </View>
          {!compact ? <View style={[styles.network, online === false && styles.networkOffline]}>
            <Text style={[styles.networkText, online === false && { color: '#fed7aa' }]}>{online === null ? 'Red…' : online ? 'En línea' : 'Sin red'}</Text>
            <View style={[styles.dot, { backgroundColor: online === null ? '#94a3b8' : online ? '#4ade80' : '#fb923c' }]} />
          </View> : null}
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.body}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Nuevo reporte. Registrar actividad realizada"
              activeOpacity={0.85} style={styles.newReport} onPress={() => navigation.navigate('NewReport', { tecnicoId, turnoId })}>
              <View style={styles.plusCircle}>
                <View style={styles.plusHorizontal} />
                <View style={styles.plusVertical} />
              </View>
              <Text style={styles.newTitle}>Nuevo Reporte</Text>
              <Text style={styles.newCaption}>Registrar actividad realizada</Text>
            </TouchableOpacity>

            <TouchableOpacity accessibilityRole="button" style={[styles.sync, (errors > 0 || syncError) && styles.syncWarning]}
              onPress={() => openReports(syncError ? 'all' : errors ? 'error' : pending ? 'pending' : 'all')}>
              <Ionicons name={errors || syncError ? 'alert-circle-outline' : pending ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
                size={20} color={errors || syncError ? '#b45309' : pending ? '#0369a1' : '#15803d'} />
              <Text style={styles.syncText} accessibilityLiveRegion="polite">{syncText}</Text>
              <Ionicons name="chevron-forward" size={16} color="#64748b" />
            </TouchableOpacity>

            <View style={styles.recentHeading}>
              <Text style={styles.sectionTitle}>Mis reportes recientes</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.seeAll} onPress={() => openReports()}>
                <Text style={styles.seeAllText}>Ver todos</Text><Ionicons name="chevron-forward" size={15} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.recentList}>
              {recent.map((report) => {
                const state = REPORT_STATES[report.status] || { icon: 'help-circle-outline', color: '#64748b', label: 'Estado desconocido' };
                const corrective = report.payload.tipo_trabajo === 'correctivo';
                const type = corrective ? 'Correctivo' : report.payload.tipo_trabajo === 'preventivo' ? 'Preventivo' : report.payload.tipo_trabajo;
                const created = new Date(report.created_at);
                const sameDay = created.toDateString() === today.toDateString();
                const when = sameDay ? created.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                  : created.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(created.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
                return <TouchableOpacity key={report.id} style={[styles.reportRow, compact && styles.reportRowCompact]}
                  accessibilityRole="button" accessibilityLabel={`${reportName(report)}, ${type}, ${when}, ${state.label}. Ver detalle`}
                  onPress={() => openReports('all', report.id)}>
                  <Text style={[styles.reportName, compact && styles.reportNameCompact]} numberOfLines={2}>{reportName(report)}</Text>
                  <View style={styles.rowDetails}>
                    <Text style={[styles.typeBadge, corrective && styles.corrective]}>{type}</Text>
                    <Text style={styles.time}>{when}</Text>
                    <Ionicons name={state.icon} size={21} color={state.color} />
                  </View>
                </TouchableOpacity>;
              })}
              {!recent.length ? <View style={styles.empty}>
                <Ionicons name="document-text-outline" size={30} color="#94a3b8" />
                <Text style={styles.emptyText}>{syncError ? 'No se pudo leer el historial.' : !loaded ? 'Cargando tus capturas…' : 'Tus reportes aparecerán aquí cuando registres tu primera actividad.'}</Text>
              </View> : null}
            </View>
            <Text style={styles.localNote}>Capturas de este dispositivo · ✓ Enviado · ◷ Pendiente</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#06132f' },
  headerSafe: { backgroundColor: '#06132f' },
  header: { width: '100%', maxWidth: 720, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 16, gap: 8 },
  menu: { padding: 9 }, grow: { flex: 1, minWidth: 0 },
  greeting: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  date: { color: '#d0d8e7', fontSize: 12, lineHeight: 18, marginTop: 2, textTransform: 'capitalize' },
  network: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 16, backgroundColor: '#102b28', paddingVertical: 7, paddingHorizontal: 9 },
  networkOffline: { backgroundColor: '#39291e' },
  networkText: { color: '#bef264', fontSize: 11, fontWeight: '600' },
  networkSmall: { color: '#cbd5e1', fontSize: 11, marginTop: 4 }, dot: { width: 8, height: 8, borderRadius: 4 },
  body: { flex: 1, backgroundColor: '#f4f5f7' },
  scroll: { paddingHorizontal: 22, paddingBottom: 24 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  newReport: { alignItems: 'center', paddingTop: 28, paddingBottom: 24 },
  plusCircle: { width: 152, height: 152, borderRadius: 76, backgroundColor: '#1478ed', borderWidth: 1, borderColor: '#3898ff', justifyContent: 'center', alignItems: 'center', shadowColor: '#0059cb', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  plusHorizontal: { position: 'absolute', width: 59, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  plusVertical: { position: 'absolute', height: 59, width: 8, borderRadius: 4, backgroundColor: '#fff' },
  newTitle: { color: '#0b1228', fontSize: 23, fontWeight: '800', marginTop: 17 },
  newCaption: { color: '#273044', fontSize: 13, marginTop: 5 },
  sync: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 9, borderRadius: 12, backgroundColor: '#eaf1f5', marginBottom: 22 },
  syncWarning: { backgroundColor: '#fff0dc' },
  syncText: { flex: 1, color: '#334155', fontSize: 12, lineHeight: 18 },
  recentHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 },
  sectionTitle: { color: '#0f172a', fontSize: 13, fontWeight: '800' },
  seeAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 12 },
  seeAllText: { color: '#475569', fontSize: 12 },
  recentList: { gap: 5 },
  reportRow: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 11, borderWidth: 1, borderColor: '#e9ecf1' },
  reportRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
  reportName: { flex: 1, color: '#111827', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  reportNameCompact: { flex: 0 },
  rowDetails: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1, flexWrap: 'wrap' },
  typeBadge: { backgroundColor: '#e5f5e8', color: '#167535', fontSize: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  corrective: { backgroundColor: '#ffebe2', color: '#bf431e' },
  time: { color: '#64748b', fontSize: 10 },
  empty: { backgroundColor: '#fff', borderRadius: 12, padding: 24, alignItems: 'center', gap: 10 },
  emptyText: { color: '#64748b', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  localNote: { color: '#64748b', fontSize: 10, lineHeight: 16, marginTop: 13, textAlign: 'center' },
});
