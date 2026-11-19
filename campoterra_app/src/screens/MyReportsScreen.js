import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import ReportDetail from '../components/ReportDetail';
import { getCachedCatalog, getReportsForTechnician, getReportStatus, retryReport, subscribeToReportChanges } from '../services/offlineSync';

const STATES = {
  pending: { label: 'Pendiente de envío', color: '#0369a1', background: '#e0f2fe' },
  syncing: { label: 'Enviando', color: '#0369a1', background: '#e0f2fe' },
  synced: { label: 'Enviado', color: '#15803d', background: '#dcfce7' },
  error: { label: 'Error de envío', color: '#9a3412', background: '#ffedd5' },
};
const FILTERS = [['all', 'Todos'], ['pending', 'Pendientes'], ['synced', 'Enviados'], ['error', 'Con error']];
const dateLabel = (value) => new Date(value).toLocaleString('es-MX');
const catalogName = (items, field, id, fallback) =>
  items.find((item) => String(item[field]) === String(id))?.nombre || fallback;

function Status({ status }) {
  const state = STATES[status] || { label: 'Estado desconocido', color: '#475569', background: '#e2e8f0' };
  return <Text style={[styles.badge, { color: state.color, backgroundColor: state.background }]}>{state.label}</Text>;
}

export default function MyReportsScreen({ navigation, route }) {
  const tecnicoId = route?.params?.tecnicoId;
  const initialFilter = FILTERS.some(([value]) => value === route?.params?.initialFilter)
    ? route.params.initialFilter : 'all';
  const initialReportId = route?.params?.reportId ?? null;
  const [reports, setReports] = useState([]);
  const [catalogs, setCatalogs] = useState({ areas: [], equipos: [], piezas: [] });
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(initialFilter);
  const [selectedId, setSelectedId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const reload = useCallback(() => {
    try {
      setReports(getReportsForTechnician(tecnicoId));
      const cached = (name) => {
        const value = getCachedCatalog(name);
        return Array.isArray(value) ? value : [];
      };
      setCatalogs({ areas: cached('areas-mantenimiento'), equipos: cached('equipos'), piezas: cached('piezas') });
      setError(tecnicoId ? null : 'No se pudo identificar tu sesión. Vuelve al inicio e inicia la jornada.');
    } catch {
      setReports([]);
      setError('No se pudo leer el historial del dispositivo. Intenta actualizar.');
    }
  }, [tecnicoId]);

  useFocusEffect(useCallback(() => {
    setSelectedId(initialReportId);
    setFilter(initialFilter);
    reload();
    return subscribeToReportChanges(reload);
  }, [reload, initialFilter, initialReportId]));

  const visible = reports.filter((report) => filter === 'all' || report.status === filter
    || (filter === 'pending' && report.status === 'syncing'));
  const selected = reports.find((report) => report.id === selectedId);
  const areaName = (report) => catalogName(catalogs.areas, 'id_area', report.payload.area_id, `Área #${report.payload.area_id}`);

  const retry = async (id) => {
    setRetrying(true);
    try {
      await retryReport(id, tecnicoId);
      const result = getReportStatus(id);
      Alert.alert(result?.status === 'synced' ? 'Reporte enviado' : 'Reporte guardado',
        result?.status === 'synced' ? 'El servidor confirmó la recepción de tu reporte.'
          : result?.last_error || 'El reporte permanece pendiente. Revisa tu conexión y la jornada activa.');
    } catch (failure) {
      Alert.alert('No se pudo reintentar', failure.message);
    } finally {
      reload();
      setRetrying(false);
    }
  };
  const requestRetry = (report) => {
    if (report.error_kind === 'review') {
      Alert.alert('Revisar antes de enviar',
        'Este reporte requiere revisión de los datos o del inventario. ¿El encargado ya resolvió el problema?',
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sí, reintentar', onPress: () => retry(report.id) }]);
    } else retry(report.id);
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Volver al inicio" accessibilityRole="button" style={styles.back}>
          <Ionicons name="arrow-back" size={25} color="#fff" />
        </TouchableOpacity>
        <View style={styles.grow}>
          <Text style={styles.title}>Mis reportes</Text>
          <Text style={styles.subtitle}>Capturados por ti en este dispositivo</Text>
        </View>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map(([value, label]) => (
            <TouchableOpacity key={value} onPress={() => setFilter(value)} accessibilityRole="button"
              accessibilityState={{ selected: filter === value }} style={[styles.filter, filter === value && styles.activeFilter]}>
              <Text style={[styles.filterText, filter === value && styles.activeFilterText]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={reload} accessibilityRole="button"><Text style={styles.link}>Actualizar</Text></TouchableOpacity>
      </View> : null}
      <FlatList data={visible} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list}
        refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); setRefreshing(false); }}
        ListEmptyComponent={!error ? <View style={styles.empty}>
          <Ionicons name="documents-outline" size={48} color="#64748b" />
          <Text style={styles.emptyTitle}>{reports.length ? 'No hay reportes con este estado' : 'Todavía no tienes reportes aquí'}</Text>
          <Text style={styles.muted}>Las capturas guardadas desde “Nuevo Reporte” aparecerán en esta lista.</Text>
        </View> : null}
        renderItem={({ item }) => <TouchableOpacity style={styles.card} onPress={() => setSelectedId(item.id)} accessibilityRole="button"
          accessibilityLabel={`Ver reporte local ${item.id}, ${areaName(item)}, ${STATES[item.status]?.label || item.status}`}>
          <View style={styles.row}><Text style={styles.localId}>Reporte local #{item.id}</Text><Status status={item.status} /></View>
          <Text style={styles.cardTitle}>{areaName(item)}</Text>
          <Text style={styles.type}>{item.payload.tipo_trabajo}</Text>
          <Text style={styles.muted}>{dateLabel(item.created_at)}</Text>
          <Text style={styles.description} numberOfLines={2}>{item.payload.descripcion || 'Sin descripción'}</Text>
          <Text style={styles.link}>Ver detalle →</Text>
        </TouchableOpacity>}
      />
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelectedId(null)}>
        {selected ? <ReportDetail report={selected} catalogs={catalogs} retrying={retrying}
          onClose={() => setSelectedId(null)} onRetry={requestRetry}
          onLogin={() => { setSelectedId(null); navigation.replace('Login'); }} /> : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  back: { padding: 10 }, grow: { flex: 1 },
  title: { color: '#fff', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#cbd5e1', marginTop: 5, fontSize: 13 },
  filters: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  filter: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22, backgroundColor: '#1e293b' },
  activeFilter: { backgroundColor: '#e0f2fe' }, filterText: { color: '#cbd5e1', fontWeight: '700' },
  activeFilterText: { color: '#075985' },
  list: { padding: 20, paddingTop: 0, flexGrow: 1 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 18, marginBottom: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  localId: { color: '#64748b', fontSize: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, fontSize: 12, fontWeight: '700', alignSelf: 'flex-start' },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginVertical: 10, flexShrink: 1 },
  type: { color: '#0369a1', fontWeight: '700', marginBottom: 7 },
  muted: { color: '#64748b', lineHeight: 21 },
  description: { color: '#334155', fontSize: 15, lineHeight: 23, marginVertical: 8 },
  link: { color: '#0369a1', fontWeight: '700', paddingVertical: 10 },
  empty: { backgroundColor: '#fff', borderRadius: 18, padding: 28, alignItems: 'center', gap: 12 },
  emptyTitle: { color: '#0f172a', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorBox: { backgroundColor: '#fff7ed', borderRadius: 12, padding: 16, margin: 16, gap: 8 },
  errorText: { color: '#9a3412', lineHeight: 22 },
});
