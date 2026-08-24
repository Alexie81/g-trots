import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Colors, fmt } from '@/constants/colors';
import Header from '@/components/Header';
import MobileChatHeaderButton from '@/components/MobileChatHeaderButton';
import ClientCollaboratorSelector from '@/components/ClientCollaboratorSelector';
import ClientExpenseSelector from '@/components/ClientExpenseSelector';
import FinancialPriceControls from '@/components/FinancialPriceControls';
import { useAuth } from '@/contexts/AuthContext';
import QrCodeViewer from '@/components/QrCodeViewer';
import WhatsAppPresetPicker from '@/components/WhatsAppPresetPicker';
import { createExpenseCategory, getClientById, updateClient, deleteClient, finalizeClient, getProfiles, getCollaborators, getExpenseCategories, getPricePresets, getServiceSheets, getOrCreateServiceSheetForClient } from '@/services/api';
import type { Profile, Collaborator, ExpenseCategory, ClientFormData, ClientStatus, Client, PricePreset } from '@/types';
import { QrCode, CheckCircle, Clock, Lock, CircleDollarSign, Trash2, History, UserCheck, MessageCircle, ChevronDown, ChevronUp, ChevronRight, FileText, Building2, Info, X } from 'lucide-react-native';
import { calculateCollaboratorDistribution } from '@/utils/collaboratorFinancials';
import { calculateClientPayment, displayAmountDueForPayment, isTotalOnlyPayment } from '@/constants/financial';

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: 'interesat', label: 'Interesat' },
  { value: 'va_folosi_codul', label: 'Cod QR Generat' },
  { value: 'cod_folosit', label: 'Cod Folosit' },
];

function clientToFormData(client: Client): ClientFormData {
  const workPrice = Number(client.price || 0) > 0
    ? Number(client.price || 0)
    : Number(client.predefined_price || 0);
  const payment = calculateClientPayment(
    workPrice,
    client.predefined_price,
    client.discount_percentage,
    client.advance_amount
  );
  return {
    name: client.name,
    phone: client.phone,
    email: client.email || '',
    status: client.status,
    price: String(workPrice || 0),
    predefined_price: String(client.predefined_price ?? 0),
    advance_amount: String(client.advance_amount ?? 0),
    currency_code: client.currency_code || 'RON',
    payment_status:
      client.payment_status
      || (payment.total > 0 && payment.amountDue <= 0 ? 'incasati' : 'de_incasat'),
    discount_percentage: String(client.discount_percentage),
    manopera_colaboratori: client.manopera_colaboratori === null ? '' : String(client.manopera_colaboratori),
    collaborator_costs: (client.collaborator_costs || [])
      .filter((item) => item.collaborator_id)
      .map((item) => ({
        collaborator_id: item.collaborator_id!,
        cost_type: item.cost_type === 'percentage' ? 'percentage' : 'fixed',
        percentage: String(item.percentage || 0),
        cost: String(item.cost),
        payment_status: item.payment_status === 'incasati' ? 'incasati' : 'de_incasat',
      })),
    valoare_piese: client.valoare_piese === null ? '' : String(client.valoare_piese),
    service_parts_price: String(client.service_parts_price ?? 0),
    service_labor_price: String(client.service_labor_price ?? 0),
    expense_costs: (client.expense_costs || [])
      .filter((item) => item.expense_id)
      .map((item) => ({
        expense_id: item.expense_id!,
        cost: String(item.cost),
      })),
    notes: client.notes || '',
    profile_id: client.profile_id || '',
    is_finalized: !!client.is_finalized,
  };
}

export default function EditClientScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [pricePresets, setPricePresets] = useState<PricePreset[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [showWhatsAppMessages, setShowWhatsAppMessages] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [openingServiceSheet, setOpeningServiceSheet] = useState(false);
  const [showServiceSheetCompanyChoice, setShowServiceSheetCompanyChoice] = useState(false);
  const [newSheetWithCompanyDetails, setNewSheetWithCompanyDetails] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [form, setForm] = useState<ClientFormData>({
    name: '',
    phone: '',
    email: '',
    status: 'interesat',
    price: '',
    predefined_price: '0',
    advance_amount: '0',
    currency_code: 'RON',
    payment_status: 'de_incasat',
    discount_percentage: '0',
    manopera_colaboratori: '',
    collaborator_costs: [],
    valoare_piese: '',
    service_parts_price: '0',
    service_labor_price: '0',
    expense_costs: [],
    notes: '',
    profile_id: '',
    is_finalized: false,
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError('');
      (async () => {
      try {
        const [c, profs, cols, expenseRows, presetRows] = await Promise.all([
          getClientById(id!, token),
          getProfiles(),
          getCollaborators(),
          getExpenseCategories(),
          token ? getPricePresets(token) : Promise.resolve([]),
        ]);
        if (!active) return;
        setProfiles(profs);
        setCollaborators(cols);
        setExpenses(expenseRows);
        setPricePresets(presetRows);
        if (c) {
          setClient(c);
          setForm(clientToFormData(c));
        }
      } catch {
        if (active) setError('Eroare la incarcare.');
      } finally {
        if (active) setLoading(false);
      }
      })();
      return () => {
        active = false;
      };
    }, [id, token])
  );

  const update = (key: keyof ClientFormData, value: ClientFormData[keyof ClientFormData]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const updatePredefinedPrice = (value: string) => {
    setForm((current) => {
      const currentPrice = parseFloat(current.price) || 0;
      const previousPredefined = parseFloat(current.predefined_price) || 0;
      const nextPredefined = parseFloat(value) || 0;
      const shouldMirrorToWorkPrice =
        nextPredefined > 0
        && (currentPrice <= 0 || Math.abs(currentPrice - previousPredefined) < 0.01);
      return {
        ...current,
        predefined_price: value,
        price: shouldMirrorToWorkPrice ? value : current.price,
      };
    });
  };

  const setCollaboratorCosts = (collaboratorCosts: ClientFormData['collaborator_costs']) => {
    setForm((current) => ({
      ...current,
      collaborator_costs: collaboratorCosts,
    }));
  };

  const onSave = async () => {
    if (!canSaveClient) return setError('Contul tau nu are permisiune pentru editarea acestui client.');
    if (client?.is_finalized && !isAdmin) return setError('Clientul este finalizat si nu mai poate fi editat.');
    if (!form.phone.trim()) return setError('Numarul de telefon este obligatoriu.');
    if (!isQrUsed && !form.name.trim()) return setError('Numele clientului este obligatoriu.');
    const disc = parseFloat(form.discount_percentage);
    if (isNaN(disc) || disc < 0 || disc > 100)
      return setError('Reducerea trebuie sa fie intre 0 si 100.');
    setError('');
    setSaving(true);
    try {
      await updateClient(id!, form, token, selectedProfile?.percentage || 0);
      router.back();
    } catch (e: any) {
      setError(e.message || 'Eroare la salvare.');
    } finally {
      setSaving(false);
    }
  };

  const onFinalize = () => {
    if (!canFinalizeClient) return setError('Contul tau nu poate finaliza acest client.');
    if (client?.is_finalized) return;
    if (!form.name.trim()) return setError('Numele clientului este obligatoriu.');
    if (!form.phone.trim()) return setError('Numarul de telefon este obligatoriu.');
    const price = parseFloat(form.price || '0');
    const predefinedPrice = parseFloat(form.predefined_price || '0');
    if (isNaN(price) || price < 0 || isNaN(predefinedPrice) || predefinedPrice < 0)
      return setError('Pretul lucrarii trebuie sa fie o valoare pozitiva sau 0.');
    const disc = parseFloat(form.discount_percentage);
    if (isNaN(disc) || disc < 0 || disc > 100)
      return setError('Reducerea trebuie sa fie intre 0 si 100.');
    Alert.alert(
      'Finalizeaza Client',
      'Clientul va fi salvat, inchis si blocat complet pentru editare. Vei putea doar sa il vizualizezi. Continui?',
      [
        { text: 'Anuleaza', style: 'cancel' },
        {
          text: 'Finalizeaza',
          onPress: async () => {
            setError('');
            setFinalizing(true);
            try {
              const updated = await finalizeClient(id!, form, token, selectedProfile?.percentage || 0);
              setClient(updated);
              setForm(clientToFormData(updated));
            } catch (e: any) {
              setError(e.message || 'Eroare la finalizare.');
            } finally {
              setFinalizing(false);
            }
          },
        },
      ]
    );
  };

  const onDelete = () => {
    if (!canDeleteClient) {
      if (isManager && isFinalized) {
        return setError('Clientul este finalizat. Managerul nu poate sterge clienti finalizati.');
      }
      return setError('Contul tau nu are permisiune pentru stergerea acestui client.');
    }
    Alert.alert('Sterge Client', 'Esti sigur ca vrei sa stergi acest client?', [
      { text: 'Anuleaza', style: 'cancel' },
      {
        text: 'Sterge',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteClient(id!, token);
            setShowDeleteSuccess(true);
            Animated.parallel([
              Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
              Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
            setTimeout(() => {
              setShowDeleteSuccess(false);
              router.replace('/(tabs)');
            }, 2200);
          } catch {
            setError('Eroare la stergere.');
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const createFirstServiceSheet = async () => {
    if (!client || !token || openingServiceSheet) return;
    setShowServiceSheetCompanyChoice(false);
    setOpeningServiceSheet(true);
    setError('');
    try {
      const sheet = await getOrCreateServiceSheetForClient(
        client.id,
        token,
        false,
        newSheetWithCompanyDetails
      );
      router.push({ pathname: '/service-sheet/[id]', params: { id: sheet.id } });
    } catch (e: any) {
      setError(e.message || 'Fisa de service nu a putut fi creata.');
    } finally {
      setOpeningServiceSheet(false);
    }
  };

  const openServiceSheet = async () => {
    if (!client || !token || openingServiceSheet) return;
    setError('');
    setOpeningServiceSheet(true);
    try {
      const existing = await getServiceSheets(token, { clientId: client.id });
      if (existing.length > 0) {
        router.push({ pathname: '/service-sheet/[id]', params: { id: existing[0].id } });
        return;
      }
      setNewSheetWithCompanyDetails(false);
      setShowServiceSheetCompanyChoice(true);
    } catch (e: any) {
      setError(e.message || 'Fisa de service nu a putut fi deschisa.');
    } finally {
      setOpeningServiceSheet(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.orange} size="large" />
      </View>
    );
  }

  // Reguli de blocare campuri
  const isFinalized = !!client?.is_finalized;
  const isQrUsed = !!(client?.qr_used || form.status === 'cod_folosit' || isFinalized);
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const userCanEdit = user?.role === 'user' && !!user?.client_edit_access;
  const isReadOnlyUser = user?.role === 'user' && !userCanEdit;
  const canViewAudit = user?.role === 'admin' || user?.role === 'manager';
  const participantCount = client?.participants?.length || 0;
  const activityCount = client?.activity_logs?.length || 0;
  const canSaveClient = isAdmin || (!isFinalized && (isManager || userCanEdit));
  const canFinalizeRole = isAdmin || isManager;
  const canFinalizeClient = !isFinalized && canFinalizeRole;
  const canDeleteRole = isAdmin || isManager;
  const canDeleteClient = isAdmin || (isManager && !isFinalized);
  const editLocked = !canSaveClient;
  const identityLocked = !canSaveClient || (isQrUsed && !isAdmin && !isManager);
  const canViewFinancials = (user?.role !== 'user' || user?.client_financial_access !== false) && !client?.financials_hidden;
  const financialEditLocked = editLocked || user?.role === 'user';
  const profileLocked = financialEditLocked;
  const selectedProfile = profiles.find((p) => p.id === form.profile_id) || null;
  const priceValue = parseFloat(form.price) || 0;
  const predefinedPriceValue = parseFloat(form.predefined_price) || 0;
  const discountValue = parseFloat(form.discount_percentage) || 0;
  const advanceAmount = Math.max(parseFloat(form.advance_amount) || 0, 0);
  const payment = calculateClientPayment(
    priceValue,
    predefinedPriceValue,
    discountValue,
    advanceAmount
  );
  const totalPriceValue = payment.grossTotal;
  const internalPartsInput = form.valoare_piese.trim() === '' ? null : Math.max(parseFloat(form.valoare_piese) || 0, 0);
  const valoarePiese = internalPartsInput === null
    ? Math.max(parseFloat(form.service_parts_price) || 0, 0)
    : internalPartsInput;
  const cheltuieliIstorice = (client?.expense_costs || [])
    .filter((item) => !item.expense_id)
    .reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
  const alteCheltuieli = cheltuieliIstorice + form.expense_costs.reduce(
    (sum, item) => sum + (parseFloat(item.cost) || 0),
    0
  );
  const totalDupaReducere = payment.total;
  const deIncasat = payment.amountDue;
  const totalOnlyPayment = isTotalOnlyPayment(priceValue, predefinedPriceValue, advanceAmount);
  const deIncasatAfisat = form.payment_status === 'incasati' && advanceAmount <= 0
    ? 0
    : displayAmountDueForPayment(priceValue, predefinedPriceValue, deIncasat, advanceAmount);
  const amountDueLabel = `Rest de plata (${form.payment_status === 'incasati' ? 'Achitat' : 'Neachitat'})`;
  const totalIncasat = totalDupaReducere;
  const profilDeIncasat = selectedProfile ? totalIncasat * (selectedProfile.percentage / 100) : 0;
  const collaboratorBaseBeforeCosts = Math.max(
    totalIncasat - profilDeIncasat - valoarePiese - alteCheltuieli,
    0
  );
  const collaboratorDistribution = calculateCollaboratorDistribution(
    form.collaborator_costs,
    collaboratorBaseBeforeCosts
  );
  const internalLaborInput = form.manopera_colaboratori.trim() === '' ? null : Math.max(parseFloat(form.manopera_colaboratori) || 0, 0);
  const manoperaColaboratori = form.collaborator_costs.length > 0
    ? collaboratorDistribution.total
    : (internalLaborInput === null ? Math.max(parseFloat(form.service_labor_price) || 0, 0) : internalLaborInput);
  const collaboratorBreakdown = collaboratorDistribution.rows
    .map((item) => {
      const collaborator = collaborators.find((c) => c.id === item.collaborator_id);
      return {
        ...item,
        name: collaborator?.name || 'Colaborator',
        color: collaborator?.color || Colors.warning,
        cost: item.calculatedCost,
      };
    })
    .filter((item) => item.cost > 0);
  const gtrotsDeIncasat = totalIncasat - profilDeIncasat - manoperaColaboratori - valoarePiese - alteCheltuieli;

  const discountPreview =
    totalPriceValue > 0 && discountValue > 0
      ? fmt((totalPriceValue * discountValue) / 100)
      : null;

  const formatAuditDate = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const sourceLabel = (source: string) =>
    ({
      owner: 'Creator',
      scan: 'Scanare',
      edit: 'Editare',
      manual: 'Manual',
      created: 'Creat',
      updated: 'Editat',
      scanned: 'Scanat',
      finalized: 'Finalizat',
      deleted: 'Sters',
    }[source] || source);

  const detailLabel = (key: string) =>
    ({
      name: 'Nume',
      phone: 'Telefon',
      qr_code: 'Cod QR',
      price: 'Pret',
      predefined_price: 'Pret predefinit',
      discount_percentage: 'Reducere',
      manopera_colaboratori: 'Manopera',
      valoare_piese: 'Cost efectiv piese',
      service_parts_price: 'Piese in fisa de service',
      service_labor_price: 'Manopera in fisa de service',
      alte_cheltuieli: 'Alte cheltuieli',
      notes: 'Note',
    }[key] || key);

  const detailValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return String(value);
    return String(value);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      <View style={styles.container}>
        <Header
          title=""
          showBack
          onBack={() => router.back()}
          right={
            <View style={styles.headerActions}>
              <MobileChatHeaderButton />
              {saving ? (
                <ActivityIndicator color={Colors.orange} />
              ) : (
                <TouchableOpacity onPress={onSave} disabled={!canSaveClient}>
                  <Text style={[styles.saveBtn, editLocked && styles.saveBtnDisabled]}>
                    {canSaveClient ? 'Salveaza' : isFinalized ? 'Finalizat' : 'Blocat'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {!isFinalized && client ? (
            <TouchableOpacity style={styles.whatsAppAction} onPress={() => setShowWhatsAppMessages(true)}>
              <View style={styles.whatsAppIcon}><MessageCircle size={18} color="#25D366" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.whatsAppTitle}>Mesaj WhatsApp presetat</Text>
                <Text style={styles.whatsAppSub}>Alege un mesaj si deschide conversatia clientului</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          {client && (user?.role !== 'user' || user?.service_sheet_access !== false) ? (
            <TouchableOpacity style={styles.serviceSheetAction} onPress={openServiceSheet} disabled={openingServiceSheet}>
              <View style={styles.serviceSheetIcon}>
                {openingServiceSheet ? <ActivityIndicator size="small" color={Colors.orange} /> : <FileText size={18} color={Colors.orange} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceSheetTitle}>Fisa de service</Text>
                <Text style={styles.serviceSheetSub}>Deschide sau creeaza automat fisa clientului</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          {isReadOnlyUser ? (
            <View style={styles.readOnlyCard}>
              <View style={styles.lockedBadge}>
                <Lock size={12} color={Colors.textMuted} />
                <Text style={styles.lockedText}>Vizualizare</Text>
              </View>
              <Text style={styles.readOnlyTitle}>Editarea clientilor nu este activa pentru acest cont.</Text>
              <Text style={styles.readOnlySub}>Accesul poate fi acordat de administrator din User Login System.</Text>
            </View>
          ) : null}

          {false && canViewAudit ? (
            <View style={styles.auditCard}>
              <View style={styles.auditTitleRow}>
                <UserCheck size={16} color={Colors.orange} />
                <Text style={styles.auditTitle}>Participanti si istoric</Text>
              </View>

              <View style={styles.participantsWrap}>
                {(client?.participants || []).length > 0 ? (
                  (client?.participants || []).map((participant) => (
                    <View key={participant.id} style={styles.participantItem}>
                      <View style={styles.participantAvatar}>
                        <Text style={styles.participantAvatarText}>
                          {(participant.display_name || participant.username || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.participantMain}>
                        <Text style={styles.participantName}>{participant.display_name || participant.username}</Text>
                        <Text style={styles.participantMeta}>
                          @{participant.username} · {participant.role}
                        </Text>
                        <View style={styles.participantBadges}>
                          {participant.sources.map((source) => (
                            <View key={`${participant.id}-${source}`} style={styles.participantBadge}>
                              <Text style={styles.participantBadgeText}>{sourceLabel(source)}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.auditEmpty}>Nu exista participanti inregistrati.</Text>
                )}
              </View>

              <View style={styles.auditDivider} />
              <View style={styles.auditTitleRow}>
                <History size={16} color={Colors.orange} />
                <Text style={styles.auditTitle}>Istoric actiuni</Text>
              </View>

              {(client?.activity_logs || []).length > 0 ? (
                (client?.activity_logs || []).map((log) => {
                  const changes = Array.isArray(log.details?.changes)
                    ? log.details.changes.filter((change) => change.field !== 'payment_status')
                    : [];
                  const detailRows = Object.entries(log.details || {}).filter(([key]) => key !== 'changes' && key !== 'payment_status');
                  return (
                    <View key={log.id} style={styles.activityItem}>
                      <View style={styles.activityDot} />
                      <View style={styles.activityMain}>
                        <View style={styles.activityTop}>
                          <Text style={styles.activitySummary}>{log.summary}</Text>
                          <Text style={styles.activityAction}>{sourceLabel(log.action)}</Text>
                        </View>
                        <Text style={styles.activityMeta}>
                          {log.actor_name || log.actor_username || 'Sistem'} · {formatAuditDate(log.created_at)}
                        </Text>
                        {changes.length > 0 ? (
                          <View style={styles.changeList}>
                            {changes.map((change, index) => (
                              <Text key={`${log.id}-change-${index}`} style={styles.changeText}>
                                {change.label}: {detailValue(change.from)} {'->'} {detailValue(change.to)}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                        {detailRows.length > 0 ? (
                          <View style={styles.changeList}>
                            {detailRows.map(([key, value]) => (
                              <Text key={`${log.id}-${key}`} style={styles.changeText}>
                                {detailLabel(key)}: {detailValue(value)}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.auditEmpty}>Nu exista actiuni inregistrate.</Text>
              )}
            </View>
          ) : null}

          {/* QR Code status + view button */}
          {isQrUsed ? (
            <View style={styles.qrUsedCard}>
              <View style={styles.qrUsedLeft}>
                <CheckCircle size={18} color={Colors.success} />
                <View>
                  <Text style={styles.qrUsedTitle}>Cod QR Utilizat</Text>
                  {isFinalized && (
                    <View style={styles.finalizedBadge}>
                      <CheckCircle size={11} color={Colors.white} />
                      <Text style={styles.finalizedText}>Finalizat</Text>
                    </View>
                  )}
                  {client?.qr_used_at && (
                    <Text style={styles.qrUsedDate}>
                      {new Date(client.qr_used_at).toLocaleDateString('ro-RO', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity style={styles.qrViewBtnDisabled} onPress={() => setShowQr(true)}>
                <QrCode size={15} color={Colors.textMuted} />
                <Text style={styles.qrViewBtnDisabledText}>Vezi QR</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.qrViewCard} onPress={() => setShowQr(true)}>
              <Clock size={16} color={Colors.warning} />
              <Text style={styles.qrViewText}>Cod QR nefolosit</Text>
              <View style={styles.qrViewBtn}>
                <QrCode size={15} color={Colors.white} />
                <Text style={styles.qrViewBtnText}>Vizualizeaza QR</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Nume - managerul il poate corecta pana la finalizare */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>Nume Client *</Text>
            {identityLocked && <Lock size={11} color={Colors.textMuted} />}
          </View>
          <TextInput
            style={[styles.input, identityLocked && styles.inputLocked]}
            placeholder="Ex: Ion Popescu"
            placeholderTextColor={Colors.textMuted}
            value={form.name}
            onChangeText={(v) => update('name', v)}
            editable={!identityLocked}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Telefon - mereu editabil */}
          <Text style={styles.label}>Numar Telefon *</Text>
          <TextInput
            style={[styles.input, editLocked && styles.inputLocked]}
            placeholder="Ex: 0700 000 000"
            placeholderTextColor={Colors.textMuted}
            value={form.phone}
            onChangeText={(v) => update('phone', v)}
            keyboardType="phone-pad"
            editable={!editLocked}
          />

          {/* Email - mereu editabil */}
          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            style={[styles.input, editLocked && styles.inputLocked]}
            placeholder="Ex: ion@email.com"
            placeholderTextColor={Colors.textMuted}
            value={form.email}
            onChangeText={(v) => update('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!editLocked}
          />

          {canViewFinancials ? (
            <>
          <FinancialPriceControls
            price={form.price}
            predefinedPrice={form.predefined_price}
            advanceAmount={form.advance_amount}
            currencyCode={form.currency_code}
            totalAmount={payment.total}
            amountDue={deIncasatAfisat}
            paymentStatus={form.payment_status}
            totalOnlyPayment={totalOnlyPayment}
            presets={pricePresets}
            disabled={financialEditLocked}
            onPriceChange={(v) => update('price', v)}
            onPredefinedPriceChange={updatePredefinedPrice}
            onAdvanceAmountChange={(v) => update('advance_amount', v)}
            onCurrencyCodeChange={(v) => update('currency_code', v)}
            onPaymentStatusChange={(v) => update('payment_status', v)}
          />

          {/* Reducere - editabila pana la finalizare */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>Reducere QR (%)</Text>
            {financialEditLocked && <Lock size={11} color={Colors.textMuted} />}
          </View>
          <View style={styles.discountRow}>
            <TextInput
              style={[styles.input, { flex: 1 }, financialEditLocked && styles.inputLocked]}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              value={form.discount_percentage}
              onChangeText={(v) => update('discount_percentage', v)}
              keyboardType="numeric"
              editable={!financialEditLocked}
            />
            {discountPreview ? (
              <View style={styles.discountPreview}>
                <Text style={styles.discountPreviewText}>-{discountPreview} {form.currency_code}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.calcGrid}>
            <View style={styles.calcField}>
              <Text style={styles.calcLabel}>{amountDueLabel}</Text>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                value={`${fmt(deIncasatAfisat)} ${form.currency_code}`}
                editable={false}
                selectTextOnFocus={false}
              />
            </View>
            <View style={styles.calcField}>
              <Text style={styles.calcLabel}>G-Trots</Text>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                value={`${fmt(gtrotsDeIncasat)} ${form.currency_code}`}
                editable={false}
                selectTextOnFocus={false}
              />
            </View>
            {selectedProfile ? (
              <View style={styles.calcField}>
                <Text style={styles.calcLabel}>{selectedProfile.name}</Text>
                <TextInput
                  style={[styles.input, styles.disabledInput]}
                  value={`${fmt(profilDeIncasat)} ${form.currency_code}`}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>
            ) : null}
          </View>

          <Text style={styles.label}>Manopera Colaboratori ({form.currency_code})</Text>
          <ClientCollaboratorSelector
            collaborators={collaborators}
            value={form.collaborator_costs}
            onChange={setCollaboratorCosts}
            disabled={financialEditLocked}
            currencyCode={form.currency_code}
            baseBeforeCollaborators={collaboratorBaseBeforeCosts}
          />

          {collaboratorBreakdown.length > 0 && (
            <View style={styles.collaboratorSummaryGrid}>
              {collaboratorBreakdown.map((item) => (
                <View key={item.collaborator_id} style={styles.collaboratorSummaryItem}>
                  <View style={styles.collaboratorSummaryLabelRow}>
                    <View style={[styles.collaboratorDot, { backgroundColor: item.color }]} />
                    <Text style={styles.collaboratorSummaryLabel} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={[styles.collaboratorSummaryValue, { color: item.color }]}>
                    {fmt(item.cost)} {form.currency_code}
                  </Text>
                  {item.cost_type === 'percentage' ? (
                    <Text style={styles.collaboratorSummaryPercent}>
                      {Number(item.percentage || 0).toFixed(2)}% din NET
                    </Text>
                  ) : null}
                  <Text style={[
                    styles.collaboratorSummaryPercent,
                    { color: item.payment_status === 'incasati' ? Colors.success : Colors.warning },
                  ]}>
                    {item.payment_status === 'incasati' ? 'Achitat' : 'Neachitat'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.label}>Cost efectiv piese - intern ({form.currency_code})</Text>
          <TextInput
            style={[styles.input, financialEditLocked && styles.inputLocked]}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            value={form.valoare_piese}
            onChangeText={(v) => update('valoare_piese', v)}
            keyboardType="numeric"
            editable={!financialEditLocked}
          />
          <Text style={styles.financialFieldHint}>Scade din suma ramasa pentru G-Trots si nu apare in PDF.</Text>

          <Text style={styles.label}>Piese afisate in fisa de service ({form.currency_code})</Text>
          <TextInput
            style={[styles.input, financialEditLocked && styles.inputLocked]}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            value={form.service_parts_price}
            onChangeText={(v) => update('service_parts_price', v)}
            keyboardType="numeric"
            editable={!financialEditLocked}
          />

          <Text style={styles.label}>Manopera afisata in fisa de service ({form.currency_code})</Text>
          <TextInput
            style={[styles.input, financialEditLocked && styles.inputLocked]}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            value={form.service_labor_price}
            onChangeText={(v) => update('service_labor_price', v)}
            keyboardType="numeric"
            editable={!financialEditLocked}
          />
          <Text style={styles.financialFieldHint}>Valorile de afisare nu modifica profitul intern.</Text>

          <Text style={styles.label}>Cheltuieli efective - intern</Text>
          <ClientExpenseSelector
            expenses={expenses}
            value={form.expense_costs}
            onChange={(expenseCosts) => setForm((current) => ({ ...current, expense_costs: expenseCosts }))}
            onCreateExpense={isAdmin || isManager ? async (name, color) => {
              if (!token) throw new Error('Sesiunea a expirat. Autentifică-te din nou.');
              const created = await createExpenseCategory(token, name, color);
              setExpenses((current) => current.some((expense) => expense.id === created.id) ? current : [...current, created]);
              return created;
            } : undefined}
            disabled={financialEditLocked}
            currencyCode={form.currency_code}
          />
            </>
          ) : (
            <View style={styles.financialHiddenCard}>
              <Lock size={18} color={Colors.orange} />
              <View style={{ flex: 1 }}>
                <Text style={styles.financialHiddenTitle}>Costurile clientului sunt ascunse</Text>
                <Text style={styles.financialHiddenText}>Administratorul a restrictionat vizualizarea sumelor incasate si a costurilor interne.</Text>
              </View>
            </View>
          )}

          {/* Note - mereu editabile */}
          <Text style={styles.label}>Note / Observatii (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput, editLocked && styles.inputLocked]}
            placeholder="Ex: Trotineta reglata, frâne verificate..."
            placeholderTextColor={Colors.textMuted}
            value={form.notes}
            onChangeText={(v) => update('notes', v)}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            editable={!editLocked}
          />

          {/* Stare - blocata daca qr folosit */}
          <Text style={styles.label}>Stare Client</Text>
          {identityLocked ? (
            <View style={styles.baniIncasatiCard}>
              <View style={styles.baniIncasatiLeft}>
                <CircleDollarSign size={20} color={Colors.success} />
                <View>
                  <Text style={styles.baniIncasatiTitle}>Bani Incasati</Text>
                  <Text style={styles.baniIncasatiSub}>
                    {!canSaveClient ? 'Statusul este blocat pentru acest cont' : 'Statusul nu mai poate fi modificat'}
                  </Text>
                </View>
              </View>
              <View style={styles.lockedBadge}>
                <Lock size={12} color={Colors.textMuted} />
                <Text style={styles.lockedText}>Blocat</Text>
              </View>
            </View>
          ) : (
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.filter((o) => o.value !== 'cod_folosit').concat(
                STATUS_OPTIONS.filter((o) => o.value === 'cod_folosit')
              ).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, form.status === opt.value && styles.chipActive]}
                  onPress={() => update('status', opt.value)}>
                  <Text
                    style={[
                      styles.chipText,
                      form.status === opt.value && styles.chipTextActive,
                    ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {isAdmin ? (
            <>
              <Text style={styles.label}>Status finalizare</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !form.is_finalized && styles.chipActive]}
                  onPress={() => update('is_finalized', false)}>
                  <Text style={[styles.chipText, !form.is_finalized && styles.chipTextActive]}>
                    Activ
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, form.is_finalized && styles.chipActive]}
                  onPress={() => update('is_finalized', true)}>
                  <Text style={[styles.chipText, form.is_finalized && styles.chipTextActive]}>
                    Finalizat manual
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {/* Agent / profil - editabil pana la finalizare pentru manager/admin */}
          <View style={styles.labelRow}>
            <Text style={styles.label}>Agent / Profil Afiliere</Text>
            {profileLocked && <Lock size={11} color={Colors.textMuted} />}
          </View>
          {profileLocked ? (
            <View style={[styles.input, styles.inputLocked, styles.profileLocked]}>
              <Text style={styles.profileLockedText}>
                {profiles.find((p) => p.id === form.profile_id)?.name || 'Niciunul'}
              </Text>
            </View>
          ) : (
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !form.profile_id && styles.chipActive]}
                onPress={() => update('profile_id', '')}>
                <Text style={[styles.chipText, !form.profile_id && styles.chipTextActive]}>
                  Niciunul
                </Text>
              </TouchableOpacity>
              {profiles.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.chip,
                    form.profile_id === p.id && { backgroundColor: p.color, borderColor: p.color },
                  ]}
                  onPress={() => update('profile_id', p.id)}>
                  <Text
                    style={[
                      styles.chipText,
                      form.profile_id === p.id ? { color: Colors.white } : { color: p.color },
                    ]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {canDeleteRole || canFinalizeRole ? (
          <View style={styles.actionRow}>
            {canFinalizeRole ? (
              <TouchableOpacity
                style={[styles.finalizeBtn, !canFinalizeClient && styles.finalizeBtnDisabled]}
                onPress={onFinalize}
                disabled={finalizing || !canFinalizeClient}>
                {finalizing ? (
                  <ActivityIndicator color={Colors.success} size="small" />
                ) : (
                  <>
                    <CheckCircle size={16} color={!canFinalizeClient ? Colors.textMuted : Colors.success} />
                    <Text style={[styles.finalizeBtnText, !canFinalizeClient && styles.finalizeBtnTextDisabled]}>
                      {isFinalized ? 'Finalizat' : 'Finalizare Client'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {canDeleteRole ? (
            <TouchableOpacity
              style={[styles.deleteBtn, !canDeleteClient && styles.deleteBtnDisabled]}
              onPress={onDelete}
              disabled={deleting || !canDeleteClient}>
                {deleting ? (
                  <ActivityIndicator color={Colors.error} size="small" />
                ) : (
                  <>
                    <Trash2 size={16} color={!canDeleteClient ? Colors.textMuted : Colors.error} />
                    <Text style={[styles.deleteBtnText, !canDeleteClient && styles.deleteBtnTextDisabled]}>
                      {canDeleteClient ? 'Sterge Client' : 'Stergere Blocata'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
          ) : null}

          {canViewAudit ? (
            <View style={styles.auditCard}>
              <TouchableOpacity
                style={styles.auditHeader}
                onPress={() => setAuditExpanded((current) => !current)}
                activeOpacity={0.82}>
                <View style={styles.auditHeaderIcon}>
                  <UserCheck size={17} color={Colors.orange} />
                </View>
                <View style={styles.auditHeaderCopy}>
                  <Text style={styles.auditTitle}>Participanti si istoric</Text>
                  <Text style={styles.auditSubtitle}>
                    {participantCount} participanti - {activityCount} actiuni
                  </Text>
                </View>
                <View style={styles.auditToggle}>
                  {auditExpanded ? (
                    <ChevronUp size={18} color={Colors.orange} />
                  ) : (
                    <ChevronDown size={18} color={Colors.orange} />
                  )}
                </View>
              </TouchableOpacity>

              {auditExpanded ? (
                <View style={styles.auditBody}>
                  <View style={styles.auditTitleRow}>
                    <UserCheck size={16} color={Colors.orange} />
                    <Text style={styles.auditSectionTitle}>Participanti</Text>
                  </View>

                  <View style={styles.participantsWrap}>
                    {(client?.participants || []).length > 0 ? (
                      (client?.participants || []).map((participant) => (
                        <View key={participant.id} style={styles.participantItem}>
                          <View style={styles.participantAvatar}>
                            <Text style={styles.participantAvatarText}>
                              {(participant.display_name || participant.username || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.participantMain}>
                            <Text style={styles.participantName}>{participant.display_name || participant.username}</Text>
                            <Text style={styles.participantMeta}>
                              @{participant.username} - {participant.role}
                            </Text>
                            <View style={styles.participantBadges}>
                              {participant.sources.map((source) => (
                                <View key={`${participant.id}-${source}`} style={styles.participantBadge}>
                                  <Text style={styles.participantBadgeText}>{sourceLabel(source)}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.auditEmpty}>Nu exista participanti inregistrati.</Text>
                    )}
                  </View>

                  <View style={styles.auditDivider} />
                  <View style={styles.auditTitleRow}>
                    <History size={16} color={Colors.orange} />
                    <Text style={styles.auditSectionTitle}>Istoric actiuni</Text>
                  </View>

                  {(client?.activity_logs || []).length > 0 ? (
                    (client?.activity_logs || []).map((log) => {
                      const changes = Array.isArray(log.details?.changes)
                        ? log.details.changes.filter((change) => change.field !== 'payment_status')
                        : [];
                      const detailRows = Object.entries(log.details || {}).filter(([key]) => key !== 'changes' && key !== 'payment_status');
                      return (
                        <View key={log.id} style={styles.activityItem}>
                          <View style={styles.activityDot} />
                          <View style={styles.activityMain}>
                            <View style={styles.activityTop}>
                              <Text style={styles.activitySummary}>{log.summary}</Text>
                              <Text style={styles.activityAction}>{sourceLabel(log.action)}</Text>
                            </View>
                            <Text style={styles.activityMeta}>
                              {log.actor_name || log.actor_username || 'Sistem'} - {formatAuditDate(log.created_at)}
                            </Text>
                            {changes.length > 0 ? (
                              <View style={styles.changeList}>
                                {changes.map((change, index) => (
                                  <Text key={`${log.id}-change-${index}`} style={styles.changeText}>
                                    {change.label}: {detailValue(change.from)} {'->'} {detailValue(change.to)}
                                  </Text>
                                ))}
                              </View>
                            ) : null}
                            {detailRows.length > 0 ? (
                              <View style={styles.changeList}>
                                {detailRows.map(([key, value]) => (
                                  <Text key={`${log.id}-${key}`} style={styles.changeText}>
                                    {detailLabel(key)}: {detailValue(value)}
                                  </Text>
                                ))}
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.auditEmpty}>Nu exista actiuni inregistrate.</Text>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>

      {client && (
        <QrCodeViewer
          visible={showQr}
          qrValue={client.qr_code}
          clientName={client.name}
          discountPercentage={client.discount_percentage}
          price={client.price}
          predefinedPrice={client.predefined_price}
          advanceAmount={client.advance_amount}
          currencyCode={client.currency_code || 'RON'}
          qrUsed={Boolean(client.qr_used || form.status === 'cod_folosit' || client.is_finalized)}
          onClose={() => setShowQr(false)}
        />
      )}
      {client && (
        <WhatsAppPresetPicker
          visible={showWhatsAppMessages}
          phone={client.phone}
          clientName={client.name}
          onClose={() => setShowWhatsAppMessages(false)}
        />
      )}

      <Modal
        visible={showServiceSheetCompanyChoice}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowServiceSheetCompanyChoice(false)}>
        <View style={styles.companyChoiceOverlay}>
          <View style={styles.companyChoiceCard}>
            <View style={styles.companyChoiceHeader}>
              <View style={styles.companyChoiceHeaderIcon}>
                <FileText size={23} color={Colors.orangeLight} strokeWidth={1.9} />
              </View>
              <View style={styles.companyChoiceHeaderCopy}>
                <Text style={styles.companyChoiceKicker}>Configurare document</Text>
                <Text style={styles.companyChoiceTitle}>Cum creezi fisa de service?</Text>
                <Text style={styles.companyChoiceSub}>
                  Alege varianta PDF. O poti schimba oricand din partea de sus a fisei.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.companyChoiceClose}
                onPress={() => setShowServiceSheetCompanyChoice(false)}
                accessibilityLabel="Inchide">
                <X size={18} color={Colors.textSecondary} strokeWidth={1.8} />
              </TouchableOpacity>
            </View>

            <View style={styles.companyChoiceOptions}>
              <TouchableOpacity
                activeOpacity={0.84}
                style={[styles.companyChoiceOption, !newSheetWithCompanyDetails && styles.companyChoiceOptionSelected]}
                onPress={() => setNewSheetWithCompanyDetails(false)}
                accessibilityRole="radio"
                accessibilityState={{ checked: !newSheetWithCompanyDetails }}>
                <View style={[styles.companyChoiceOptionIcon, !newSheetWithCompanyDetails && styles.companyChoiceOptionIconSelected]}>
                  <FileText size={20} color={!newSheetWithCompanyDetails ? Colors.orangeLight : Colors.textSecondary} strokeWidth={1.8} />
                </View>
                <View style={styles.companyChoiceOptionCopy}>
                  <Text style={styles.companyChoiceOptionTitle}>Fara datele firmei</Text>
                  <Text style={styles.companyChoiceOptionSub}>Document simplu, fara informatiile prestatorului</Text>
                  <View style={styles.companyChoiceDefaultBadge}>
                    <Text style={styles.companyChoiceDefaultText}>Prestabilit</Text>
                  </View>
                </View>
                <View style={[styles.companyChoiceRadio, !newSheetWithCompanyDetails && styles.companyChoiceRadioSelected]}>
                  {!newSheetWithCompanyDetails ? <View style={styles.companyChoiceRadioDot} /> : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.84}
                style={[styles.companyChoiceOption, newSheetWithCompanyDetails && styles.companyChoiceOptionSelected]}
                onPress={() => setNewSheetWithCompanyDetails(true)}
                accessibilityRole="radio"
                accessibilityState={{ checked: newSheetWithCompanyDetails }}>
                <View style={[styles.companyChoiceOptionIcon, newSheetWithCompanyDetails && styles.companyChoiceOptionIconSelected]}>
                  <Building2 size={20} color={newSheetWithCompanyDetails ? Colors.orangeLight : Colors.textSecondary} strokeWidth={1.8} />
                </View>
                <View style={styles.companyChoiceOptionCopy}>
                  <Text style={styles.companyChoiceOptionTitle}>Cu datele firmei</Text>
                  <Text style={styles.companyChoiceOptionSub}>Include prestatorul si informatiile firmei in PDF</Text>
                </View>
                <View style={[styles.companyChoiceRadio, newSheetWithCompanyDetails && styles.companyChoiceRadioSelected]}>
                  {newSheetWithCompanyDetails ? <View style={styles.companyChoiceRadioDot} /> : null}
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.companyChoiceNotice}>
              <Info size={16} color={Colors.orangeLight} strokeWidth={1.9} />
              <Text style={styles.companyChoiceNoticeText}>
                <Text style={styles.companyChoiceNoticeStrong}>
                  {newSheetWithCompanyDetails ? 'Cu datele firmei' : 'Fara datele firmei'}
                </Text>
                {' '}se va folosi pentru download, share si WhatsApp.
              </Text>
            </View>

            <View style={styles.companyChoiceActions}>
              <TouchableOpacity style={styles.companyChoiceCancel} onPress={() => setShowServiceSheetCompanyChoice(false)}>
                <Text style={styles.companyChoiceCancelText}>Anuleaza</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.companyChoiceCreate} onPress={createFirstServiceSheet} disabled={openingServiceSheet}>
                {openingServiceSheet ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <>
                    <Text style={styles.companyChoiceCreateText}>Creeaza fisa</Text>
                    <ChevronRight size={17} color={Colors.white} strokeWidth={2.2} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete success modal */}
      <Modal visible={showDeleteSuccess} transparent animationType="none" statusBarTranslucent>
        <View style={styles.successOverlay}>
          <Animated.View style={[styles.successCard, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
            <View style={styles.successIconWrap}>
              <CheckCircle size={40} color={Colors.success} />
            </View>
            <Text style={styles.successTitle}>Client Sters!</Text>
            <Text style={styles.successSub}>
              {client?.name ? `"${client.name}" a fost sters` : 'Clientul a fost sters'}
              {'\n'}cu succes din baza de date.
            </Text>
            <View style={styles.successDots}>
              <View style={[styles.dot, styles.dotActive]} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  form: { padding: 16, paddingBottom: 140 },
  whatsAppAction: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#25D36612', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#25D36655', marginBottom: 12 },
  whatsAppIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25D36618' },
  whatsAppTitle: { color: '#25D366', fontSize: 13, fontFamily: 'Inter-SemiBold' },
  whatsAppSub: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  serviceSheetAction: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ff7a0012', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#ff7a0055', marginBottom: 12 },
  serviceSheetIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff7a0018' },
  serviceSheetTitle: { color: Colors.orange, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  serviceSheetSub: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  financialFieldHint: { color: Colors.textMuted, fontSize: 11, lineHeight: 16, fontFamily: 'Inter-Regular', marginTop: 7, marginBottom: 18 },
  financialHiddenCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.orange + '44', marginVertical: 16 },
  financialHiddenTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  financialHiddenText: { color: Colors.textMuted, fontSize: 11, lineHeight: 17, fontFamily: 'Inter-Regular', marginTop: 4 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    marginTop: 14,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  inputLocked: {
    backgroundColor: Colors.bg,
    color: Colors.textMuted,
    borderColor: Colors.separator,
  },
  profileLocked: {
    justifyContent: 'center',
  },
  profileLockedText: {
    color: Colors.textMuted,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  qrViewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warningDim,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '44',
    marginBottom: 4,
  },
  qrViewText: { color: Colors.warning, fontSize: 13, fontFamily: 'Inter-Medium', flex: 1 },
  qrViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.orange,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  qrViewBtnText: { color: Colors.white, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  qrUsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.successDim,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.success + '44',
    marginBottom: 4,
  },
  qrUsedLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  qrUsedTitle: { color: Colors.success, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  finalizedBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.orange,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
  },
  finalizedText: { color: Colors.white, fontSize: 10, fontFamily: 'Inter-SemiBold' },
  qrUsedDate: { color: Colors.success + 'AA', fontSize: 11, fontFamily: 'Inter-Regular' },
  qrViewBtnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  qrViewBtnDisabledText: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Medium' },
  readOnlyCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 8,
    marginBottom: 4,
  },
  readOnlyTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-SemiBold' },
  readOnlySub: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  auditCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginTop: 16,
    marginBottom: 12,
    gap: 10,
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  auditHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.orangeDim,
    borderWidth: 1,
    borderColor: Colors.orangeMid,
  },
  auditHeaderCopy: { flex: 1, minWidth: 0 },
  auditSubtitle: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  auditToggle: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  auditBody: { gap: 10, paddingTop: 2 },
  auditTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  auditTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold' },
  auditSectionTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  participantsWrap: { gap: 10 },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  participantAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.orangeDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.orangeMid,
  },
  participantAvatarText: { color: Colors.orange, fontSize: 14, fontFamily: 'Inter-Bold' },
  participantMain: { flex: 1, minWidth: 0 },
  participantName: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  participantMeta: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  participantBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  participantBadge: {
    backgroundColor: Colors.orangeDim,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.orangeMid,
  },
  participantBadgeText: { color: Colors.orange, fontSize: 10, fontFamily: 'Inter-SemiBold' },
  auditDivider: { height: 1, backgroundColor: Colors.separator, marginVertical: 2 },
  auditEmpty: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  activityItem: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  activityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.orange,
    marginTop: 5,
  },
  activityMain: { flex: 1, minWidth: 0 },
  activityTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activitySummary: { flex: 1, color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  activityAction: {
    color: Colors.orange,
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    backgroundColor: Colors.orangeDim,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  activityMeta: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 4 },
  changeList: { marginTop: 7, gap: 3 },
  changeText: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 16 },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  discountPreview: {
    backgroundColor: Colors.successDim,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.success + '44',
  },
  discountPreviewText: { color: Colors.success, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  calcGrid: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 8,
  },
  calcField: { flex: 1 },
  calcLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  disabledInput: {
    color: Colors.textSecondary,
    backgroundColor: Colors.surface,
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  notesInput: { minHeight: 80, fontSize: 14 },
  collaboratorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 10,
  },
  collaboratorCardLocked: {
    backgroundColor: Colors.bg,
    borderColor: Colors.separator,
  },
  collaboratorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  collaboratorInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collaboratorDot: { width: 10, height: 10, borderRadius: 5 },
  collaboratorNameWrap: { flex: 1 },
  collaboratorName: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  collaboratorRole: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  collaboratorInput: {
    width: 104,
    textAlign: 'right',
    fontFamily: 'Inter-SemiBold',
  },
  collaboratorTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    paddingTop: 10,
  },
  collaboratorTotalLabel: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Medium' },
  collaboratorTotalValue: { color: Colors.orange, fontSize: 13, fontFamily: 'Inter-Bold' },
  emptyCollaboratorsText: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  collaboratorSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  collaboratorSummaryItem: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    backgroundColor: Colors.card,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  collaboratorSummaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  collaboratorSummaryLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  collaboratorSummaryValue: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  collaboratorSummaryPercent: {
    marginTop: 3,
    color: Colors.textMuted,
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  chipActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  chipText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Medium' },
  chipTextActive: { color: Colors.white },
  saveBtn: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter-SemiBold' },
  saveBtnDisabled: { color: Colors.textMuted },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 32,
  },
  finalizeBtn: {
    flex: 1,
    backgroundColor: Colors.successDim,
    borderWidth: 1,
    borderColor: Colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  finalizeBtnDisabled: {
    backgroundColor: Colors.card,
    borderColor: Colors.cardBorder,
  },
  finalizeBtnText: { color: Colors.success, fontSize: 14, fontFamily: 'Inter-SemiBold' },
  finalizeBtnTextDisabled: { color: Colors.textMuted },
  deleteBtn: {
    flex: 1,
    backgroundColor: Colors.errorDim,
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBtnDisabled: {
    backgroundColor: Colors.card,
    borderColor: Colors.cardBorder,
  },
  deleteBtnText: { color: Colors.error, fontSize: 15, fontFamily: 'Inter-SemiBold' },
  deleteBtnTextDisabled: { color: Colors.textMuted },
  errorText: {
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
  },
  baniIncasatiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successDim,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.success + '55',
  },
  baniIncasatiLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  baniIncasatiTitle: { color: Colors.success, fontSize: 15, fontFamily: 'Inter-Bold' },
  baniIncasatiSub: { color: Colors.success + 'AA', fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  lockedText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Medium' },
  companyChoiceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 30,
  },
  companyChoiceCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#171513',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.orange + '45',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 24,
  },
  companyChoiceHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  companyChoiceHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.orange + '55',
    backgroundColor: Colors.orangeDim,
  },
  companyChoiceHeaderCopy: { flex: 1, minWidth: 0 },
  companyChoiceClose: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF08',
  },
  companyChoiceKicker: { color: Colors.orangeLight, fontSize: 9, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 1.05 },
  companyChoiceTitle: { color: Colors.textPrimary, fontSize: 18, lineHeight: 22, fontFamily: 'Inter-Bold', marginTop: 3 },
  companyChoiceSub: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 16, marginTop: 5 },
  companyChoiceOptions: { gap: 10, marginTop: 20 },
  companyChoiceOption: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF05',
    padding: 14,
  },
  companyChoiceOptionSelected: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  companyChoiceOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF08',
  },
  companyChoiceOptionIconSelected: { borderColor: Colors.orange + '66', backgroundColor: Colors.orangeDim },
  companyChoiceOptionCopy: { flex: 1, minWidth: 0 },
  companyChoiceOptionTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  companyChoiceOptionSub: { color: Colors.textSecondary, fontSize: 10, lineHeight: 15, fontFamily: 'Inter-Regular', marginTop: 4 },
  companyChoiceDefaultBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.orange + '55',
    backgroundColor: Colors.orangeDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  companyChoiceDefaultText: { color: Colors.orangeLight, fontSize: 8, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.7 },
  companyChoiceRadio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyChoiceRadioSelected: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  companyChoiceRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.orange },
  companyChoiceNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF05',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  companyChoiceNoticeText: { flex: 1, color: Colors.textSecondary, fontSize: 9.5, lineHeight: 14, fontFamily: 'Inter-Regular' },
  companyChoiceNoticeStrong: { color: Colors.textPrimary, fontFamily: 'Inter-Bold' },
  companyChoiceActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  companyChoiceCancel: { flex: 0.8, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: '#FFFFFF05' },
  companyChoiceCancelText: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Bold' },
  companyChoiceCreate: { flex: 1.2, minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.orange },
  companyChoiceCreateText: { color: Colors.white, fontSize: 12, fontFamily: 'Inter-Bold' },  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: Colors.success + '44',
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.successDim,
    borderWidth: 2,
    borderColor: Colors.success + '55',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    marginBottom: 10,
  },
  successSub: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  successDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.cardBorder,
  },
  dotActive: {
    backgroundColor: Colors.success,
    width: 20,
  },
});
