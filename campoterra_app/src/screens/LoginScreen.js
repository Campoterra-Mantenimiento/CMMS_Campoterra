import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, useWindowDimensions, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { startShift, getShiftOptions } from '../services/api';
import { cacheCatalog, getCachedCatalog, getPendingReportSummary, subscribeToSync } from '../services/offlineSync';

export default function LoginScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600; 

  const [tecnico, setTecnico] = useState(null);
  const [turno, setTurno] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');

  // Estados para cargar las opciones del backend
  const [tecnicosList, setTecnicosList] = useState([]);
  const [turnosList, setTurnosList] = useState([]);
  
  // Estados para controlar el menú emergente (Modal)
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState(''); // 'tecnico' o 'turno'

  // Estado real de conectividad y sincronización offline
  const [isConnected, setIsConnected] = useState(true);
  const [syncSummary, setSyncSummary] = useState({ pending: 0, errors: 0 });

  // useEffect se ejecuta automáticamente al abrir la pantalla
  useEffect(() => {
    loadOptions();
  }, []);

  // Inicializa y suscribe el estado real de red/sincronización
  useEffect(() => {
    let isMounted = true;

    NetInfo.fetch().then((state) => {
      if (isMounted) setIsConnected(!!state.isConnected);
    });
    setSyncSummary(getPendingReportSummary());

    const unsubscribe = subscribeToSync((summary) => {
      if (!isMounted) return;
      setSyncSummary(summary);
      NetInfo.fetch().then((state) => {
        if (isMounted) setIsConnected(!!state.isConnected);
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  async function loadOptions() {
    setOptionsError('');
    try {
      const data = await getShiftOptions();
      cacheCatalog('shift_options', data);
      setTecnicosList(data.tecnicos);
      setTurnosList(data.turnos);
      if (!data.tecnicos.length || !data.turnos.length) setOptionsError('Faltan técnicos o turnos. Pide al encargado que cargue los catálogos del piloto.');
    } catch (error) {
      console.log('No se pudieron cargar las opciones', error);
      const cached = getCachedCatalog('shift_options');
      if (cached) {
        setTecnicosList(cached.tecnicos || []);
        setTurnosList(cached.turnos || []);
      }
      setOptionsError(cached ? 'Sin conexión al servidor. Se muestran las opciones guardadas.' : `No se pudieron cargar las opciones: ${error.message}`);
    }
  }

  const openModal = (type) => {
    setModalType(type);
    setModalVisible(true);
  };

  const handleSelectOption = (item) => {
    if (modalType === 'tecnico') {
      setTecnico(item);
    } else {
      setTurno(item);
    }
    setModalVisible(false);
  };

  const handleLogin = async () => {
    if (!tecnico || !turno) {
      Alert.alert('Datos incompletos', 'Por favor selecciona tu nombre y tu turno.');
      return;
    }

    setIsLoading(true);
    try {
      await startShift(tecnico, turno);
      navigation.replace('Home', { 
        nombreTecnico: tecnico.nombre,
        tecnicoId: tecnico.id_tecnico,
        turnoActivo: turno.etiqueta,
        turnoId: turno.id_turno,
      });
    } catch (error) {
      Alert.alert('Error de Conexión', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const pendingCount = syncSummary.pending || 0;
  const errorCount = syncSummary.errors || 0;
  const hasErrors = errorCount > 0;
  const hasPending = pendingCount > 0;

  const statusPanelStyle = !isConnected
    ? styles.statusPanelError
    : hasErrors
    ? styles.statusPanelError
    : hasPending
    ? styles.statusPanelWarning
    : styles.statusPanel;

  const dotStyle = !isConnected
    ? styles.dotError
    : hasErrors
    ? styles.dotError
    : hasPending
    ? styles.dotWarning
    : styles.dot;

  const statusTitle = !isConnected ? 'Modo sin conexión' : 'Conexión disponible';
  const statusSub = !isConnected
    ? 'Los reportes se sincronizarán al recuperar señal'
    : 'Sincronización automática';

  let statusRightText = 'Sincronización\nactiva';
  if (hasErrors) {
    statusRightText = `${errorCount} reporte(s)\ncon error`;
  } else if (hasPending) {
    statusRightText = `${pendingCount} reporte(s)\npendiente(s) de subir`;
  }

  return (
    <View style={styles.mainContainer}>
      
      <Image 
        source={require('../../assets/images/fondo_login.png')} 
        style={[styles.absoluteBackground, { width: isTablet ? '100%' : width * 1.6, right: 0 }]}
        resizeMode="cover"
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.scrollContainer, { paddingHorizontal: isTablet ? 50 : 20 }]} showsVerticalScrollIndicator={false}>
          {!!optionsError && <View style={{ backgroundColor: '#fff3d6', padding: 16, borderRadius: 12, marginBottom: 16 }}>
            <Text accessibilityRole="alert">{optionsError}</Text>
            <TouchableOpacity onPress={loadOptions} accessibilityRole="button" style={{ paddingVertical: 12 }}><Text style={{ color: '#075699', fontWeight: '700' }}>Volver a cargar</Text></TouchableOpacity>
          </View>}
          
          <View style={styles.headerRow}>
            <View style={styles.logoTextContainer}>
              <Image source={require('../../assets/images/logo.png')} style={[styles.logo, { width: isTablet ? 65 : 50, height: isTablet ? 65 : 50 }]} />
              <View style={styles.brandContainer}>
                <Text style={[styles.brandTitle, { fontSize: isTablet ? 22 : 18 }]}>CAMPOTERRA</Text>
                <Text style={styles.brandSubtitle}>CONGELADORA</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.areaText}>Á R E A   D E   M A N T E N I M I E N T O</Text>

          <View style={[styles.welcomeSection, { marginBottom: isTablet ? 40 : 25 }]}>
            <Text style={styles.helloText}>HOLA</Text>
            <Text style={[styles.welcomeTitle, { fontSize: isTablet ? 44 : 34 }]}>¡Bienvenido!</Text>
            <Text style={[styles.welcomeSubtitle, { fontSize: isTablet ? 17 : 14 }]}>Selecciona tu información{'\n'}para iniciar tu jornada en Mantenimiento.</Text>
          </View>

          <TouchableOpacity style={styles.selectorCard} onPress={() => openModal('tecnico')}>
            <View style={[styles.iconBox, { backgroundColor: '#e3f0fa', width: isTablet ? 65 : 55, height: isTablet ? 65 : 55 }]}>
              <Ionicons name="person" size={isTablet ? 28 : 22} color="#0b437a" />
            </View>
            <View style={styles.selectorInfo}>
              <Text style={styles.labelText}>EMPLEADO</Text>
              <Text style={[styles.valueText, { fontSize: isTablet ? 22 : 18 }]}>{tecnico?.nombre || 'Seleccionar...'}</Text>
              <Text style={styles.subValueText}>Toca para seleccionar</Text>
            </View>
            <Ionicons name="chevron-down" size={24} color="#7f8fa6" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.selectorCard} onPress={() => openModal('turno')}>
            <View style={[styles.iconBox, { backgroundColor: '#e5f3e7', width: isTablet ? 65 : 55, height: isTablet ? 65 : 55 }]}>
              <MaterialCommunityIcons name="calendar-month" size={isTablet ? 28 : 22} color="#27ae60" />
            </View>
            <View style={styles.selectorInfo}>
              <Text style={styles.labelText}>TURNO</Text>
              <Text style={[styles.valueText, { fontSize: isTablet ? 22 : 18 }]}>{turno?.etiqueta || 'Seleccionar...'}</Text>
              <Text style={styles.subValueText}>Toca para seleccionar</Text>
            </View>
            <Ionicons name="chevron-down" size={24} color="#7f8fa6" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.primaryButton, { paddingVertical: isTablet ? 22 : 16 }]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <View style={styles.buttonCenter}>
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="play" size={isTablet ? 24 : 20} color="#fff" style={styles.playIcon} />
                  <Text style={[styles.buttonText, { fontSize: isTablet ? 22 : 18 }]}>INICIAR JORNADA</Text>
                </>
              )}
            </View>
            <MaterialCommunityIcons name="tools" size={isTablet ? 50 : 40} color="rgba(255,255,255,0.15)" style={styles.bgIcon} />
          </TouchableOpacity>

          {/* Menú Rápido y Estado omitidos por brevedad visual en este bloque, pero mantienen su diseño original */}
          <View style={statusPanelStyle}>
            <View style={styles.statusLeft}>
              <View style={dotStyle} />
              <View>
                <Text style={styles.statusTitle}>{statusTitle}</Text>
                <Text style={styles.statusSub}>{statusSub}</Text>
              </View>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.statusRight}>
              <Ionicons
                name={hasErrors || !isConnected ? 'alert-circle-outline' : 'cloud-upload-outline'}
                size={isTablet ? 28 : 22}
                color={hasErrors || !isConnected ? '#c0392b' : hasPending ? '#e67e22' : '#7f8fa6'}
              />
              <Text style={styles.statusTextRight}>{statusRightText}</Text>
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* MODAL DESPLEGABLE */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {modalType === 'tecnico' ? 'Selecciona tu nombre' : 'Selecciona tu turno'}
            </Text>
            
            <FlatList 
              data={modalType === 'tecnico' ? tecnicosList : turnosList}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.optionItem} onPress={() => handleSelectOption(item)}>
                  <Text style={styles.optionText}>
                    {modalType === 'tecnico' ? item.nombre : item.etiqueta}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />

            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeModalText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#f5f7fa' },
  absoluteBackground: { position: 'absolute', top: 0, bottom: 0, height: '100%' },
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  scrollContainer: { paddingTop: 30, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoTextContainer: { flexDirection: 'row', alignItems: 'center' },
  logo: { borderRadius: 30, marginRight: 12 },
  brandContainer: { justifyContent: 'center' },
  brandTitle: { fontWeight: '900', color: '#0b1528', letterSpacing: 0.5 },
  brandSubtitle: { fontSize: 11, color: '#0fa5e9', fontWeight: '700', letterSpacing: 1.5 },
  divider: { height: 1, backgroundColor: '#d1d8e0', marginTop: 20, marginBottom: 10, opacity: 0.5 },
  areaText: { fontSize: 12, color: '#7f8fa6', fontWeight: '600', letterSpacing: 2, marginBottom: 20 },
  welcomeSection: {},
  helloText: { fontSize: 16, color: '#0fa5e9', fontWeight: '800', letterSpacing: 1 },
  welcomeTitle: { fontWeight: '900', color: '#0b1528', marginBottom: 5 },
  welcomeSubtitle: { color: '#4b6584', lineHeight: 22 },
  selectorCard: { backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  iconBox: { borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  selectorInfo: { flex: 1 },
  labelText: { fontSize: 10, color: '#4b6584', fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  valueText: { fontWeight: 'bold', color: '#0b1528' },
  subValueText: { fontSize: 12, color: '#7f8fa6', marginTop: 2 },
  primaryButton: { backgroundColor: '#27ae60', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 20, overflow: 'hidden', shadowColor: '#27ae60', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 },
  buttonCenter: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  playIcon: { marginRight: 10 },
  buttonText: { color: '#ffffff', fontWeight: '800', letterSpacing: 1 },
  bgIcon: { position: 'absolute', right: -5, bottom: -5 },
  statusPanel: { backgroundColor: 'rgba(234, 244, 235, 0.95)', borderRadius: 12, flexDirection: 'row', padding: 12, alignItems: 'center', marginBottom: 25 },
  statusPanelWarning: { backgroundColor: 'rgba(253, 235, 213, 0.95)', borderRadius: 12, flexDirection: 'row', padding: 12, alignItems: 'center', marginBottom: 25 },
  statusPanelError: { backgroundColor: 'rgba(250, 219, 216, 0.95)', borderRadius: 12, flexDirection: 'row', padding: 12, alignItems: 'center', marginBottom: 25 },
  statusLeft: { flex: 2, flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#27ae60', marginRight: 10 },
  dotWarning: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e67e22', marginRight: 10 },
  dotError: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#c0392b', marginRight: 10 },
  statusTitle: { fontSize: 13, fontWeight: '700', color: '#0b1528' },
  statusSub: { fontSize: 10, color: '#7f8fa6', marginTop: 2 },
  verticalDivider: { width: 1, height: 30, backgroundColor: '#d1d8e0', marginHorizontal: 12 },
  statusRight: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  statusTextRight: { fontSize: 10, color: '#7f8fa6', marginLeft: 6 },
  
  // Estilos del Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(11, 21, 40, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 25, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0b1528', marginBottom: 20, textAlign: 'center' },
  optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  optionText: { fontSize: 16, color: '#4b6584', fontWeight: '600' },
  closeModalBtn: { marginTop: 20, padding: 16, backgroundColor: '#f1f5f9', borderRadius: 12, alignItems: 'center' },
  closeModalText: { fontSize: 15, fontWeight: '800', color: '#64748b' }
});
