import React, { useState, useRef, useCallback } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors } from '@/constants/colors';
import Header from '@/components/Header';
import MobileChatHeaderButton from '@/components/MobileChatHeaderButton';
import { useAuth } from '@/contexts/AuthContext';
import QrServiceModal from '@/components/QrServiceModal';
import QrSuccessModal from '@/components/QrSuccessModal';
import QrErrorModal from '@/components/QrErrorModal';
import { getClientByQrCode, getOrCreateServiceSheetForClient, getPricePresets, markQrUsed } from '@/services/api';
import type { Client, PricePreset, ServiceFormData } from '@/types';
import { Focus, Keyboard, Lightbulb, ScanLine, Smartphone, SunMedium, ZoomIn } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

type ScanState = 'idle' | 'loading';

export default function ScannerScreen() {
  const router = useRouter();
  const { token, user, refreshUser } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(0.08);
  const [cameraReady, setCameraReady] = useState(false);
  const [pricePresets, setPricePresets] = useState<PricePreset[]>([]);

  // Modals
  const [pendingClient, setPendingClient] = useState<Client | null>(null);
  const [showService, setShowService] = useState(false);
  const [successClient, setSuccessClient] = useState<Client | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorClient, setErrorClient] = useState<Client | null>(null);
  const [showError, setShowError] = useState(false);

  const processingRef = useRef(false);
  const scanLineProgress = useRef(new Animated.Value(0)).current;
  const canScanFinalized = user?.role === 'admin' || user?.role === 'manager';
  const canViewServiceSheets = user?.role !== 'user' || user?.service_sheet_access !== false;

  useFocusEffect(
    useCallback(() => {
      refreshUser();
      if (token) getPricePresets(token).then(setPricePresets).catch(() => setPricePresets([]));
      setActive(true);
      setCameraReady(false);
      setScanState('idle');
      processingRef.current = false;
      scanLineProgress.setValue(0);
      const scannerAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineProgress, { toValue: 1, duration: 1650, useNativeDriver: true }),
          Animated.timing(scanLineProgress, { toValue: 0, duration: 1650, useNativeDriver: true }),
        ])
      );
      scannerAnimation.start();
      return () => {
        scannerAnimation.stop();
        setTorchEnabled(false);
        setActive(false);
      };
    }, [refreshUser, token])
  );

  const scanLineTranslateY = scanLineProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, FRAME_SIZE - 14],
  });

  const handleCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || processingRef.current) return;
    processingRef.current = true;
    setScanState('loading');

    try {
      const client = await getClientByQrCode(trimmed, token);

      if (!client) {
        // Not found - show inline error and reset
        setErrorClient(null);
        setShowError(false);
        setScanState('idle');
        processingRef.current = false;
        // Reuse error modal with no client to show "not found"
        setErrorClient({ id: '', name: 'Necunoscut', phone: '', email: null, status: 'interesat', qr_code: trimmed, qr_used: false, qr_used_at: null, discount_percentage: 0, price: 0, predefined_price: 0, advance_amount: 0, amount_due: 0, currency_code: 'RON', payment_status: 'de_incasat', manopera_colaboratori: 0, valoare_piese: 0, service_parts_price: 0, service_labor_price: 0, alte_cheltuieli: 0, collaborator_costs: [], expense_costs: [], price_edit_count: 0, is_finalized: false, notes: null, profile_id: null, created_at: '' });
        setShowError(true);
        return;
      }

      if (client.is_finalized) {
        if (canScanFinalized && token) {
          const sheet = await getOrCreateServiceSheetForClient(client.id, token, false, false, true);
          setScanState('idle');
          processingRef.current = false;
          setManualCode('');
          router.push({ pathname: '/service-sheet/[id]', params: { id: sheet.id, fromScan: '1' } });
          return;
        }

        // Already used → show error sweet alert
        setScanState('idle');
        setErrorClient(client);
        setShowError(true);
        processingRef.current = false;
        return;
      }

      // Valid unused QR → show service form
      setScanState('idle');
      setPendingClient(client);
      setShowService(true);
    } catch {
      setScanState('idle');
      processingRef.current = false;
    }
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (scanState === 'idle' && !showService && !showSuccess && !showError) {
      handleCode(data);
    }
  };

  const onServiceSave = async (form: ServiceFormData) => {
    if (!pendingClient) return;
    const price = parseFloat(form.price) || 0;
    const predefinedPrice = parseFloat(form.predefined_price) || 0;
    const advance = Math.max(parseFloat(form.advance_amount) || 0, 0);
    const discount = parseFloat(form.discount_percentage) || 0;
    const updated = await markQrUsed(
      pendingClient.id,
      price,
      predefinedPrice,
      advance,
      form.currency_code || 'RON',
      form.payment_status === 'incasati' ? 'incasati' : 'de_incasat',
      discount,
      form.notes,
      token
    );
    setShowService(false);
    setPendingClient(null);
    setSuccessClient(updated);
    setShowSuccess(true);
  };

  const onOpenServiceSheet = async (client: Client) => {
    if (!token) throw new Error('Autentificare necesara.');
    const sheet = await getOrCreateServiceSheetForClient(client.id, token, false, false, true);
    setShowService(false);
    setPendingClient(null);
    processingRef.current = false;
    setScanState('idle');
      router.push({ pathname: '/service-sheet/[id]', params: { id: sheet.id, fromScan: '1' } });
  };

  const onServiceCancel = () => {
    setShowService(false);
    setPendingClient(null);
    processingRef.current = false;
    setScanState('idle');
  };

  const onSuccessClose = () => {
    setShowSuccess(false);
    setSuccessClient(null);
    processingRef.current = false;
    setScanState('idle');
    setManualCode('');
  };

  const onErrorClose = () => {
    setShowError(false);
    setErrorClient(null);
    processingRef.current = false;
    setScanState('idle');
    setManualCode('');
  };

  const renderCamera = () => {
    if (Platform.OS === 'web') {
      return (
        <View style={styles.webFallback}>
          <ScanLine size={48} color={Colors.orange} />
          <Text style={styles.webFallbackTitle}>Scanner QR</Text>
          <Text style={styles.webFallbackSub}>
            Camera este disponibila doar pe dispozitive mobile.{'\n'}Foloseste modul manual de mai jos.
          </Text>
        </View>
      );
    }
    if (!permission) {
      return <View style={styles.permWrap}><ActivityIndicator color={Colors.orange} /></View>;
    }
    if (!permission.granted) {
      return (
        <View style={styles.permWrap}>
          <ScanLine size={40} color={Colors.textMuted} />
          <Text style={styles.permText}>Aplicatia necesita acces la camera</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Acorda Permisiune</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        active={active}
        autofocus="off"
        zoom={cameraZoom}
        enableTorch={torchEnabled}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onCameraReady={() => setCameraReady(true)}
        onBarcodeScanned={scanState === 'idle' && !showService && !showSuccess && !showError ? onBarcodeScanned : undefined}>
        <View style={styles.scanOverlay}>
          <View style={styles.scannerTopBar}>
            <View style={styles.scannerStatus}>
              <View style={[styles.liveDot, cameraReady && styles.liveDotReady]} />
              <Text style={styles.scannerStatusText}>{cameraReady ? 'CĂUTARE QR ACTIVĂ' : 'PORNIRE CAMERĂ'}</Text>
            </View>
            <View style={styles.cameraControls}>
              <TouchableOpacity
                style={[styles.cameraControl, cameraZoom > 0.08 && styles.cameraControlActive]}
                onPress={() => setCameraZoom((zoom) => zoom > 0.08 ? 0.08 : 0.16)}
                accessibilityLabel="Comută zoomul camerei">
                <ZoomIn size={16} color={cameraZoom > 0.08 ? Colors.white : Colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cameraControl, torchEnabled && styles.cameraControlActive]}
                onPress={() => setTorchEnabled((enabled) => !enabled)}
                accessibilityLabel={torchEnabled ? 'Oprește lumina' : 'Pornește lumina'}>
                <Lightbulb size={16} color={torchEnabled ? Colors.white : Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.scanShade} />
          <View style={styles.scanMiddleRow}>
            <View style={styles.scanShade} />
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              {scanState === 'idle' ? (
                <Animated.View style={[styles.scannerLineWrap, { transform: [{ translateY: scanLineTranslateY }] }]}>
                  <View style={styles.scannerGlow} />
                  <LinearGradient
                    colors={['transparent', Colors.orangeLight, Colors.orange, Colors.orangeLight, 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.scannerLine}
                  />
                </Animated.View>
              ) : null}
              {!cameraReady ? (
                <View style={styles.cameraStarting}>
                  <ActivityIndicator color={Colors.orange} />
                </View>
              ) : null}
              {scanState === 'loading' ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color={Colors.orange} size="large" />
                  <Text style={styles.loadingText}>Verificare cod...</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.scanShade} />
          </View>
          <View style={styles.scanShade} />

          <View style={styles.scanHintCard}>
            <Focus size={15} color={Colors.orangeLight} />
            <Text style={styles.scanHint}>Ține codul în centru și telefoanele paralele</Text>
          </View>
        </View>
      </CameraView>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="" right={<MobileChatHeaderButton />} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {!manualMode && (
          <View style={styles.cameraWrap}>{renderCamera()}</View>
        )}

        <View style={styles.privacyTip}>
          <View style={styles.privacyTipIcon}>
            <SunMedium size={18} color={Colors.orange} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyTipTitle}>Cod pe telefon cu folie privacy?</Text>
            <Text style={styles.privacyTipText}>Mareste luminozitatea acelui telefon si tine camera perfect drept in fata ecranului.</Text>
          </View>
        </View>

        <View style={styles.manualSection}>
          <TouchableOpacity
            style={styles.manualToggle}
            onPress={() => {
              setManualMode((value) => !value);
              setTorchEnabled(false);
              processingRef.current = false;
              setScanState('idle');
            }}>
            <View style={styles.manualToggleIcon}>
              {manualMode ? <ScanLine size={18} color={Colors.orange} /> : <Keyboard size={18} color={Colors.orange} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.manualToggleText}>{manualMode ? 'Revino la scanare' : 'Introdu codul manual'}</Text>
              <Text style={styles.manualToggleSub}>{manualMode ? 'Deschide din nou camera QR' : 'Foloseste codul scris sub QR'}</Text>
            </View>
            <Text style={styles.manualToggleArrow}>›</Text>
          </TouchableOpacity>

          {manualMode && (
            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.manualInput}
                placeholder="Ex: GT-M5X3K1-A7F2"
                placeholderTextColor={Colors.textMuted}
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.manualBtn, (!manualCode.trim() || scanState === 'loading') && styles.manualBtnDisabled]}
                onPress={() => handleCode(manualCode)}
                disabled={!manualCode.trim() || scanState === 'loading'}>
                {scanState === 'loading' ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.manualBtnText}>Valideaza</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.instructions}>
          <View style={styles.instructionsHead}>
            <Smartphone size={17} color={Colors.orange} />
            <Text style={styles.instrTitle}>Scanare rapida</Text>
          </View>
          <View style={styles.instructionSteps}>
            <View style={styles.instructionStep}><Text style={styles.stepNumber}>1</Text><Text style={styles.instrText}>Centreaza intregul cod in chenar.</Text></View>
            <View style={styles.instructionStep}><Text style={styles.stepNumber}>2</Text><Text style={styles.instrText}>Apropie sau departeaza lent telefonul.</Text></View>
            <View style={styles.instructionStep}><Text style={styles.stepNumber}>3</Text><Text style={styles.instrText}>Dupa detectare, datele clientului apar automat.</Text></View>
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
      <QrServiceModal
        visible={showService}
        client={pendingClient}
        pricePresets={pricePresets}
        onSave={onServiceSave}
        onOpenServiceSheet={canViewServiceSheets ? onOpenServiceSheet : undefined}
        onCancel={onServiceCancel}
      />
      <QrSuccessModal
        visible={showSuccess}
        client={successClient}
        onClose={onSuccessClose}
      />
      <QrErrorModal
        visible={showError}
        client={errorClient}
        onClose={onErrorClose}
      />
    </View>
  );
}

const FRAME_SIZE = 236;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { flex: 1 },
  contentContainer: { paddingBottom: 28 },
  cameraWrap: {
    height: 382,
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Colors.orange + '3D',
  },
  scanOverlay: { ...StyleSheet.absoluteFill },
  scannerTopBar: {
    position: 'absolute',
    zIndex: 5,
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scannerStatus: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(8,8,8,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.warning },
  liveDotReady: { backgroundColor: Colors.success, shadowColor: Colors.success, shadowOpacity: 0.9, shadowRadius: 5 },
  scannerStatusText: { color: Colors.white, fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 0.55 },
  cameraControls: { flexDirection: 'row', gap: 7 },
  cameraControl: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(8,8,8,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  cameraControlActive: { backgroundColor: Colors.orange, borderColor: Colors.orangeLight },
  scanShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)' },
  scanMiddleRow: { height: FRAME_SIZE, flexDirection: 'row' },
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  corner: { position: 'absolute', zIndex: 3, width: 38, height: 38, borderColor: Colors.orange, borderWidth: 4 },
  cornerTL: { top: 7, left: 7, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 20 },
  cornerTR: { top: 7, right: 7, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 20 },
  cornerBL: { bottom: 7, left: 7, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 20 },
  cornerBR: { bottom: 7, right: 7, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 20 },
  scannerLineWrap: { position: 'absolute', zIndex: 2, top: 0, left: 13, right: 13, height: 4 },
  scannerLine: { height: 3, borderRadius: 3 },
  scannerGlow: { position: 'absolute', top: -7, left: 22, right: 22, height: 17, backgroundColor: Colors.orange + '26', borderRadius: 12 },
  cameraStarting: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 6,
    backgroundColor: 'rgba(0,0,0,0.66)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    gap: 10,
  },
  loadingText: { color: Colors.orange, fontFamily: 'Inter-Medium', fontSize: 14 },
  scanHintCard: {
    position: 'absolute',
    zIndex: 5,
    bottom: 15,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 13,
    backgroundColor: 'rgba(8,8,8,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  scanHint: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontFamily: 'Inter-Medium', textAlign: 'center' },

  webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  webFallbackTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: 'Inter-SemiBold' },
  webFallbackSub: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter-Regular', textAlign: 'center' },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  permText: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter-Regular', textAlign: 'center' },
  permBtn: { backgroundColor: Colors.orange, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  permBtnText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter-SemiBold' },

  privacyTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginHorizontal: 14,
    marginTop: 12,
    padding: 12,
    borderRadius: 15,
    backgroundColor: Colors.orange + '0F',
    borderWidth: 1,
    borderColor: Colors.orange + '2B',
  },
  privacyTipIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orangeDim },
  privacyTipTitle: { color: Colors.textPrimary, fontSize: 11, fontFamily: 'Inter-SemiBold', marginBottom: 3 },
  privacyTipText: { color: Colors.textSecondary, fontSize: 10, fontFamily: 'Inter-Regular', lineHeight: 15 },
  manualSection: { marginHorizontal: 14, marginTop: 12, padding: 11, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.cardBorder },
  manualToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 },
  manualToggleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orangeDim },
  manualToggleText: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  manualToggleSub: { color: Colors.textMuted, fontSize: 9, fontFamily: 'Inter-Regular', marginTop: 2 },
  manualToggleArrow: { color: Colors.orange, fontSize: 24, lineHeight: 26 },
  manualInputRow: { flexDirection: 'row', gap: 9, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.separator },
  manualInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  manualBtn: { backgroundColor: Colors.orange, borderRadius: 11, paddingHorizontal: 15, justifyContent: 'center' },
  manualBtnDisabled: { backgroundColor: Colors.textMuted },
  manualBtnText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-SemiBold' },

  instructions: {
    marginHorizontal: 14,
    marginTop: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  instructionsHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  instrTitle: { color: Colors.textPrimary, fontSize: 11, fontFamily: 'Inter-SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  instructionSteps: { gap: 9 },
  instructionStep: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  stepNumber: { width: 24, height: 24, textAlign: 'center', textAlignVertical: 'center', borderRadius: 8, color: Colors.orange, backgroundColor: Colors.orangeDim, fontSize: 10, fontFamily: 'Inter-Bold', lineHeight: 24 },
  instrText: { flex: 1, color: Colors.textSecondary, fontSize: 10, fontFamily: 'Inter-Regular', lineHeight: 15 },
});
