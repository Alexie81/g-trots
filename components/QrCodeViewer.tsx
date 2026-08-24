import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
  Linking,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors, fmt } from '@/constants/colors';
import { calculateClientPayment, displayAmountDueForPayment } from '@/constants/financial';
import { X, Share2, MessageCircle, Lock } from 'lucide-react-native';

const appLogo = require('../assets/images/logo.png');

interface Props {
  visible: boolean;
  qrValue: string;
  clientName: string;
  discountPercentage: number;
  price: number;
  predefinedPrice?: number;
  advanceAmount?: number;
  currencyCode?: string;
  qrUsed: boolean;
  onClose: () => void;
}

export default function QrCodeViewer({
  visible,
  qrValue,
  clientName,
  discountPercentage,
  price,
  predefinedPrice = 0,
  advanceAmount = 0,
  currencyCode = 'RON',
  qrUsed,
  onClose,
}: Props) {
  const svgRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');

  const payment = calculateClientPayment(
    price,
    predefinedPrice,
    discountPercentage,
    advanceAmount
  );
  const totalPrice = payment.grossTotal;
  const discountAmount = totalPrice - payment.total;
  const finalPrice = payment.total;
  const amountDue = displayAmountDueForPayment(price, predefinedPrice, payment.amountDue, advanceAmount);

  const getBase64 = (): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!svgRef.current) return reject(new Error('SVG not ready'));
      svgRef.current.toDataURL((data: string) => resolve(data));
    });

  const getShareText = () =>
    `Buna ziua! Codul tau QR G-Trots:\nClient: ${clientName}\nCod: ${qrValue}` +
    (Number(predefinedPrice || 0) > 0 ? `\nPret predefinit: ${fmt(predefinedPrice)} ${currencyCode}` : '') +
    (discountPercentage > 0
      ? `\nReducere: ${discountPercentage}% (${fmt(discountAmount)} ${currencyCode})`
      : '') +
    `\nAvans: ${fmt(advanceAmount)} ${currencyCode}\nTotal: ${fmt(finalPrice)} ${currencyCode}\nRest de plata: ${fmt(amountDue)} ${currencyCode}`;

  const saveQrImage = async () => {
    const base64 = await getBase64();
    const safeQrValue = qrValue.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileUri = `${FileSystem.cacheDirectory}qr_${safeQrValue}.png`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return fileUri;
  };

  const shareQrImageOnly = async (fileUri: string, dialogTitle: string) => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      throw new Error('Native sharing is not available on this device.');
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: 'image/png',
      dialogTitle,
      UTI: 'public.png',
    });
  };

  const shareQrTextToWhatsApp = async (text: string) => {
    const encodedText = encodeURIComponent(text);
    const webUrl = `https://wa.me/?text=${encodedText}`;
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') throw new Error('Web sharing is not available.');
      window.open(webUrl, '_blank');
      return;
    }

    const appUrl = `whatsapp://send?text=${encodedText}`;
    const canOpenWhatsApp = await Linking.canOpenURL(appUrl);
    await Linking.openURL(canOpenWhatsApp ? appUrl : webUrl);
  };

  const shareWhatsApp = async () => {
    setShareError('');
    const text = getShareText();

    setSharing(true);
    try {
      await shareQrTextToWhatsApp(text);
    } catch (error) {
      console.warn('WhatsApp text sharing failed:', error);
      setShareError('Eroare la trimiterea textului pe WhatsApp.');
    } finally {
      setSharing(false);
    }
  };

  const shareImage = async () => {
    if (Platform.OS === 'web') {
      setShareError('Partajarea imaginilor nu este suportata pe web.');
      return;
    }
    setSharing(true);
    setShareError('');
    try {
      const fileUri = await saveQrImage();
      await shareQrImageOnly(fileUri, `Cod QR - ${clientName}`);
    } catch (error) {
      console.warn('QR image sharing failed:', error);
      setShareError('Eroare la partajare. Incearca din nou.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.card}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <X size={22} color={Colors.textSecondary} />
            </TouchableOpacity>

            <Text style={styles.title}>Cod QR Client</Text>
            <Text style={styles.clientName}>{clientName}</Text>

            {qrUsed ? (
              <View style={styles.usedWrap}>
                <Lock size={40} color={Colors.textMuted} />
                <Text style={styles.usedTitle}>Cod Deja Utilizat</Text>
                <Text style={styles.usedSub}>
                  Acest cod QR a fost scanat si nu mai poate fi folosit.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.qrWrap}>
                  <View style={styles.qrBorder}>
                    <QRCode
                      value={qrValue}
                      size={200}
                      color={Colors.white}
                      backgroundColor={Colors.card}
                      getRef={(ref) => (svgRef.current = ref)}
                      logo={appLogo}
                      logoSize={38}
                      logoBorderRadius={15}
                    />
                  </View>
                </View>

                <View style={styles.codeRow}>
                  <Text style={styles.codeLabel}>Cod:</Text>
                  <Text style={styles.codeValue}>{qrValue}</Text>
                </View>

                {discountPercentage > 0 && (
                  <View style={styles.discountBanner}>
                    <Text style={styles.discountTitle}>Reducere {discountPercentage}%</Text>
                    <Text style={styles.discountDetail}>
                    {fmt(discountAmount)} {currencyCode} reducere · Total: {fmt(finalPrice)} {currencyCode}
                    </Text>
                  </View>
                )}

                {shareError ? <Text style={styles.errorText}>{shareError}</Text> : null}

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.whatsappBtn}
                    onPress={shareWhatsApp}
                    disabled={sharing}>
                    {sharing ? (
                      <ActivityIndicator color={Colors.white} size="small" />
                    ) : (
                      <>
                        <MessageCircle size={20} color={Colors.white} />
                        <Text style={styles.whatsappText}>Trimite pe WhatsApp</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={shareImage}
                    disabled={sharing}>
                    <Share2 size={20} color={Colors.orange} />
                    <Text style={styles.shareBtnText}>Distribuie Imaginea</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: Math.min(width - 48, 340),
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  title: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: 8,
  },
  clientName: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  qrWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  qrBorder: {
    padding: 16,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.orange + '55',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    backgroundColor: Colors.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    width: '100%',
  },
  codeLabel: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular' },
  codeValue: { color: Colors.orange, fontSize: 14, fontFamily: 'Inter-Bold', flex: 1 },
  discountBanner: {
    backgroundColor: Colors.successDim,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 14,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.success + '44',
  },
  discountTitle: { color: Colors.success, fontSize: 16, fontFamily: 'Inter-Bold', marginBottom: 2 },
  discountDetail: { color: Colors.success + 'CC', fontSize: 12, fontFamily: 'Inter-Regular' },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 8,
  },
  actions: { flexDirection: 'column', gap: 10, width: '100%' },
  whatsappBtn: {
    width: '100%',
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  whatsappText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  shareBtn: {
    width: '100%',
    backgroundColor: Colors.orangeDim,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.orange + '55',
  },
  shareBtnText: {
    color: Colors.orange,
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  usedWrap: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  usedTitle: { color: Colors.textSecondary, fontSize: 16, fontFamily: 'Inter-SemiBold' },
  usedSub: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 19,
  },
});
