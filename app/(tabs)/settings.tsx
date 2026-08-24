import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  RefreshControl,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { Colors } from '@/constants/colors';
import Header from '@/components/Header';
import WhatsAppPredefinedMessages from '@/components/WhatsAppPredefinedMessages';
import SystemDatabaseSettings from '@/components/SystemDatabaseSettings';
import LogoutConfirmModal from '@/components/logout-confirm-modal';
import KeyboardAwareScrollView from '@/components/KeyboardAwareScrollView';
import SwipeDownSheet from '@/components/SwipeDownSheet';
import { useAuth } from '@/contexts/AuthContext';
import {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  getCollaborators,
  createCollaborator,
  updateCollaborator,
  deleteCollaborator,
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  getAppUsers,
  createAppUser,
  updateAppUser,
  deleteAppUser,
  getMobileAppUpdate,
  getCompanySettings,
  saveCompanySettings,
  getPricePresets,
  createPricePreset,
  updatePricePreset,
  deletePricePreset,
} from '@/services/api';
import type { Profile, Collaborator, ExpenseCategory, CompanySettings, AppUser, UserRole, PlatformAccess, PricePreset } from '@/types';
import {
  Plus,
  Pencil,
  Trash2,
  Percent,
  Wrench,
  Users,
  Building2,
  ShieldCheck,
  Monitor,
  Smartphone,
  KeyRound,
  MessageCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
  LogOut,
  Mail,
  Phone,
  CalendarClock,
  ReceiptText,
  Download,
  RefreshCcw,
  MapPin,
  Globe2,
  Landmark,
  CircleDollarSign,
  Upload,
  FileText,
  Eye,
} from 'lucide-react-native';

const PRESET_COLORS = [
  '#FF6B00', '#F59E0B', '#22C55E', '#3B82F6',
  '#EC4899', '#14B8A6', '#EF4444', '#8B5CF6',
];

const appLogo = require('../../assets/images/logo.png');

type UserFormState = {
  username: string;
  display_name: string;
  password: string;
  role: UserRole;
  platform_access: PlatformAccess;
  support_chat_access: boolean;
  client_panel_access: boolean;
  client_edit_access: boolean;
  service_sheet_access: boolean;
  client_financial_access: boolean;
  is_active: boolean;
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'user', label: 'User' },
];

const PLATFORM_OPTIONS: { value: PlatformAccess; label: string }[] = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobil' },
  { value: 'both', label: 'Desktop + Mobil' },
];

const emptyUserForm = (): UserFormState => ({
  username: '',
  display_name: '',
  password: '',
  role: 'user',
  platform_access: 'mobile',
  support_chat_access: false,
  client_panel_access: true,
  client_edit_access: false,
  service_sheet_access: true,
  client_financial_access: true,
  is_active: true,
});

const emptyCompanyForm = (): CompanySettings => ({
  company_name: '',
  fiscal_code: '',
  registration_number: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  bank_name: '',
  iban: '',
  stamp_image: '',
});

function roleLabel(role: UserRole) {
  if (role === 'admin') return 'Admin';
  if (role === 'manager') return 'Manager';
  return 'User';
}

function platformLabel(platform: PlatformAccess) {
  if (platform === 'both') return 'Desktop + Mobil';
  if (platform === 'desktop') return 'Desktop';
  return 'Mobil';
}

function isProtectedAdminUser(row?: AppUser | null) {
  return String(row?.username || '').toLowerCase() === 'admin';
}

function userInitials(row: AppUser) {
  const base = row.display_name || row.username || 'U';
  return base
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';
}

function compareAlphabetically(a: string, b: string) {
  return String(a || '').localeCompare(String(b || ''), 'ro', { sensitivity: 'base' });
}

function formatAddedAt(value?: string) {
  if (!value) return 'Data indisponibila';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return 'Data indisponibila';
  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type MobileUpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'opening' | 'error';
type GtrotsGlobal = typeof globalThis & {
  __GTROTS_MOBILE_UPDATE_ALERTED_VERSION?: string;
};

const mobileCurrentVersion =
  Constants.expoConfig?.version ||
  (Constants as any).manifest2?.extra?.expoClient?.version ||
  '1.2.4';

export default function SettingsScreen() {
  const { token, user, logout, refreshUser } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [profileModal, setProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [pForm, setPForm] = useState({ name: '', role: '', percentage: '', color: '#FF6B00' });
  const [pError, setPError] = useState('');
  const [pLoading, setPLoading] = useState(false);
  const [expandProfiles, setExpandProfiles] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorModal, setCollaboratorModal] = useState(false);
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null);
  const [cForm, setCForm] = useState({ name: '', role: '', phone: '', email: '', percentage: '0', color: '#14B8A6' });
  const [cError, setCError] = useState('');
  const [cLoading, setCLoading] = useState(false);
  const [expandCollaborators, setExpandCollaborators] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [expenseModal, setExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseCategory | null>(null);
  const [expenseForm, setExpenseForm] = useState({ name: '', color: '#EF4444' });
  const [expenseError, setExpenseError] = useState('');
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expandExpenses, setExpandExpenses] = useState(false);
  const [pricePresets, setPricePresets] = useState<PricePreset[]>([]);
  const [pricePresetModal, setPricePresetModal] = useState(false);
  const [editingPricePreset, setEditingPricePreset] = useState<PricePreset | null>(null);
  const [pricePresetForm, setPricePresetForm] = useState({ label: '', price: '' });
  const [pricePresetError, setPricePresetError] = useState('');
  const [pricePresetLoading, setPricePresetLoading] = useState(false);
  const [expandPricePresets, setExpandPricePresets] = useState(false);
  const [companyForm, setCompanyForm] = useState<CompanySettings>(emptyCompanyForm);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState('');
  const [companyMessage, setCompanyMessage] = useState('Datele firmei sunt sincronizate prin API.');
  const [expandCompany, setExpandCompany] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [uForm, setUForm] = useState<UserFormState>(emptyUserForm);
  const [uError, setUError] = useState('');
  const [uLoading, setULoading] = useState(false);
  const [expandUsers, setExpandUsers] = useState(false);
  const [logoutPromptVisible, setLogoutPromptVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [mobileUpdateStatus, setMobileUpdateStatus] = useState<MobileUpdateStatus>('idle');
  const [mobileUpdateMessage, setMobileUpdateMessage] = useState('Poti verifica daca exista o versiune noua.');
  const [mobileAvailableVersion, setMobileAvailableVersion] = useState('');
  const [mobileDownloadUrl, setMobileDownloadUrl] = useState('');
  const mobileUpdateAlertedVersionRef = useRef(
    (globalThis as GtrotsGlobal).__GTROTS_MOBILE_UPDATE_ALERTED_VERSION || ''
  );

  const load = async (roleOverride = user?.role) => {
    try {
      const [p, c, expenseRows, presetRows, companyInfo, managedUsers] = await Promise.all([
        getProfiles(),
        getCollaborators(),
        getExpenseCategories(),
        token ? getPricePresets(token) : Promise.resolve([]),
        token ? getCompanySettings(token) : Promise.resolve(emptyCompanyForm()),
        roleOverride === 'admin' && token ? getAppUsers(token) : Promise.resolve([]),
      ]);
      setProfiles(p);
      setCollaborators(c);
      setExpenses(expenseRows);
      setPricePresets(presetRows);
      setCompanyForm({ ...emptyCompanyForm(), ...companyInfo });
      setCompanyMessage(companyInfo?.updated_at ? `Ultima actualizare: ${formatAddedAt(companyInfo.updated_at)}` : 'Completeaza si salveaza datele firmei.');
      setUsers(managedUsers);
    } catch {}
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      (async () => {
        const freshUser = await refreshUser();
        if (freshUser?.role === 'user') return;
        await load(freshUser?.role);
      })().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [refreshUser, user?.role])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    const freshUser = await refreshUser();
    if (freshUser?.role === 'user') {
      setRefreshing(false);
      return;
    }
    await load(freshUser?.role);
    setRefreshing(false);
  };

  const openNewProfile = () => {
    setEditingProfile(null);
    setPForm({ name: '', role: '', percentage: '', color: '#FF6B00' });
    setPError('');
    setProfileModal(true);
  };

  const openEditProfile = (p: Profile) => {
    setEditingProfile(p);
    setPForm({ name: p.name, role: p.role, percentage: String(p.percentage), color: p.color });
    setPError('');
    setProfileModal(true);
  };

  const saveProfile = async () => {
    if (!token) return;
    if (!pForm.name.trim()) return setPError('Numele este obligatoriu.');
    const pct = parseFloat(pForm.percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) return setPError('Procentul trebuie sa fie intre 0 si 100.');
    setPError('');
    setPLoading(true);
    try {
      if (editingProfile) {
        const updated = await updateProfile(token, editingProfile.id, pForm.name.trim(), pForm.role.trim(), pct, pForm.color);
        setProfiles((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const created = await createProfile(token, pForm.name.trim(), pForm.role.trim(), pct, pForm.color);
        setProfiles((ps) => [...ps, created]);
      }
      setProfileModal(false);
    } catch (e: any) {
      setPError(e.message || 'Eroare.');
    } finally {
      setPLoading(false);
    }
  };

  const confirmDeleteProfile = (p: Profile) => {
    Alert.alert(
      'Sterge Agent',
      `Stergi agentul "${p.name}"? Clientii asociati vor fi dezasociati.`,
      [
        { text: 'Anuleaza', style: 'cancel' },
        {
          text: 'Sterge',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!token) return;
              await deleteProfile(token, p.id);
              setProfiles((ps) => ps.filter((x) => x.id !== p.id));
            } catch {
              Alert.alert('Eroare', 'Nu s-a putut sterge agentul.');
            }
          },
        },
      ]
    );
  };

  const openNewCollaborator = () => {
    setEditingCollaborator(null);
    setCForm({ name: '', role: '', phone: '', email: '', percentage: '0', color: '#14B8A6' });
    setCError('');
    setCollaboratorModal(true);
  };

  const openEditCollaborator = (c: Collaborator) => {
    setEditingCollaborator(c);
    setCForm({
      name: c.name,
      role: c.role || '',
      phone: c.phone || '',
      email: c.email || '',
      percentage: String(c.percentage || 0),
      color: c.color || '#14B8A6',
    });
    setCError('');
    setCollaboratorModal(true);
  };

  const saveCollaborator = async () => {
    if (!token) return;
    if (!cForm.name.trim()) return setCError('Numele este obligatoriu.');
    const percentage = parseFloat(cForm.percentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      return setCError('Procentul trebuie sa fie intre 0 si 100.');
    }
    setCError('');
    setCLoading(true);
    try {
      if (editingCollaborator) {
        const updated = await updateCollaborator(
          token,
          editingCollaborator.id,
          cForm.name.trim(),
          cForm.role.trim(),
          cForm.phone.trim(),
          cForm.email.trim(),
          percentage,
          cForm.color
        );
        setCollaborators((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createCollaborator(
          token,
          cForm.name.trim(),
          cForm.role.trim(),
          cForm.phone.trim(),
          cForm.email.trim(),
          percentage,
          cForm.color
        );
        setCollaborators((cs) => [...cs, created]);
      }
      setCollaboratorModal(false);
    } catch (e: any) {
      setCError(e.message || 'Eroare.');
    } finally {
      setCLoading(false);
    }
  };

  const confirmDeleteCollaborator = (c: Collaborator) => {
    Alert.alert(
      'Sterge Colaborator',
      `Stergi colaboratorul "${c.name}"? Costurile deja salvate pe clienti raman in statistici.`,
      [
        { text: 'Anuleaza', style: 'cancel' },
        {
          text: 'Sterge',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!token) return;
              await deleteCollaborator(token, c.id);
              setCollaborators((cs) => cs.filter((x) => x.id !== c.id));
            } catch {
              Alert.alert('Eroare', 'Nu s-a putut sterge colaboratorul.');
            }
          },
        },
      ]
    );
  };

  const openNewExpense = () => {
    setEditingExpense(null);
    setExpenseForm({ name: '', color: '#EF4444' });
    setExpenseError('');
    setExpenseModal(true);
  };

  const openEditExpense = (expense: ExpenseCategory) => {
    setEditingExpense(expense);
    setExpenseForm({ name: expense.name, color: expense.color || '#EF4444' });
    setExpenseError('');
    setExpenseModal(true);
  };

  const saveExpense = async () => {
    if (!token) return;
    if (!expenseForm.name.trim()) return setExpenseError('Denumirea este obligatorie.');
    setExpenseError('');
    setExpenseLoading(true);
    try {
      if (editingExpense) {
        const updated = await updateExpenseCategory(
          token,
          editingExpense.id,
          expenseForm.name.trim(),
          expenseForm.color
        );
        setExpenses((items) => items.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await createExpenseCategory(token, expenseForm.name.trim(), expenseForm.color);
        setExpenses((items) => [...items, created]);
      }
      setExpenseModal(false);
    } catch (e: any) {
      setExpenseError(e.message || 'Cheltuiala nu a putut fi salvata.');
    } finally {
      setExpenseLoading(false);
    }
  };

  const confirmDeleteExpense = (expense: ExpenseCategory) => {
    Alert.alert(
      'Sterge cheltuiala',
      `Stergi optiunea "${expense.name}"? Valorile deja salvate pe clienti raman in istoric.`,
      [
        { text: 'Anuleaza', style: 'cancel' },
        {
          text: 'Sterge',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!token) return;
              await deleteExpenseCategory(token, expense.id);
              setExpenses((items) => items.filter((item) => item.id !== expense.id));
            } catch (e: any) {
              Alert.alert('Eroare', e.message || 'Cheltuiala nu a putut fi stearsa.');
            }
          },
        },
      ]
    );
  };

  const openNewPricePreset = () => {
    setEditingPricePreset(null);
    setPricePresetForm({ label: '', price: '' });
    setPricePresetError('');
    setPricePresetModal(true);
  };

  const openEditPricePreset = (preset: PricePreset) => {
    setEditingPricePreset(preset);
    setPricePresetForm({ label: preset.label, price: String(preset.price) });
    setPricePresetError('');
    setPricePresetModal(true);
  };

  const savePricePreset = async () => {
    if (!token) return;
    if (!pricePresetForm.label.trim()) return setPricePresetError('Labelul este obligatoriu.');
    const price = parseFloat(pricePresetForm.price);
    if (isNaN(price) || price < 0) return setPricePresetError('Pretul trebuie sa fie 0 sau mai mare.');
    setPricePresetError('');
    setPricePresetLoading(true);
    try {
      if (editingPricePreset) {
        const updated = await updatePricePreset(
          token,
          editingPricePreset.id,
          pricePresetForm.label.trim(),
          price
        );
        setPricePresets((items) => items.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await createPricePreset(token, pricePresetForm.label.trim(), price);
        setPricePresets((items) => [...items, created]);
      }
      setPricePresetModal(false);
    } catch (e: any) {
      setPricePresetError(e.message || 'Pretul predefinit nu a putut fi salvat.');
    } finally {
      setPricePresetLoading(false);
    }
  };

  const confirmDeletePricePreset = (preset: PricePreset) => {
    Alert.alert(
      'Sterge pret predefinit',
      `Stergi pretul "${preset.label}"?`,
      [
        { text: 'Anuleaza', style: 'cancel' },
        {
          text: 'Sterge',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!token) return;
              await deletePricePreset(token, preset.id);
              setPricePresets((items) => items.filter((item) => item.id !== preset.id));
            } catch (e: any) {
              Alert.alert('Eroare', e.message || 'Pretul predefinit nu a putut fi sters.');
            }
          },
        },
      ]
    );
  };

  const updateCompanyField = (field: keyof CompanySettings, value: string) => {
    setCompanyForm((current) => ({ ...current, [field]: value }));
  };

  const pickCompanyStamp = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permisiune necesara', 'Permite accesul la galerie pentru a selecta stampila.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const asset = result.assets[0];
    const mime = asset.mimeType?.includes('png') ? 'image/png' : 'image/jpeg';
    updateCompanyField('stamp_image', `data:${mime};base64,${asset.base64}`);
  };

  const clearCompanyStamp = () => {
    updateCompanyField('stamp_image', '');
  };

  const saveCompany = async () => {
    if (!token) return;
    const email = companyForm.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCompanyError('Email firma invalid.');
      return;
    }
    setCompanyError('');
    setCompanyMessage('Se salveaza datele firmei...');
    setCompanySaving(true);
    try {
      const payload: CompanySettings = {
        company_name: companyForm.company_name.trim(),
        fiscal_code: companyForm.fiscal_code.trim(),
        registration_number: companyForm.registration_number.trim(),
        address: companyForm.address.trim(),
        phone: companyForm.phone.trim(),
        email,
        website: companyForm.website.trim(),
        bank_name: companyForm.bank_name.trim(),
        iban: companyForm.iban.trim(),
        stamp_image: companyForm.stamp_image || '',
      };
      const saved = await saveCompanySettings(token, payload);
      setCompanyForm({ ...emptyCompanyForm(), ...saved });
      setCompanyMessage('Datele firmei au fost salvate.');
      Alert.alert('Date salvate', 'Datele firmei au fost actualizate.');
    } catch (error: any) {
      setCompanyError(error?.message || 'Nu pot salva datele firmei.');
      setCompanyMessage('Verifica API-ul si incearca din nou.');
    } finally {
      setCompanySaving(false);
    }
  };

  const openNewUser = () => {
    setEditingUser(null);
    setUForm(emptyUserForm());
    setUError('');
    setUserModal(true);
  };

  const openEditUser = (row: AppUser) => {
    setEditingUser(row);
    setUForm({
      username: row.username || '',
      display_name: row.display_name || row.username || '',
      password: '',
      role: row.role || 'user',
      platform_access: row.platform_access || 'mobile',
      support_chat_access: Boolean(row.support_chat_access),
      client_panel_access: row.client_panel_access !== false,
      client_edit_access: Boolean(row.client_edit_access),
      service_sheet_access: row.service_sheet_access !== false,
      client_financial_access: row.client_financial_access !== false,
      is_active: Boolean(row.is_active),
    });
    setUError('');
    setUserModal(true);
  };

  const setUserRole = (role: UserRole) => {
    setUForm((form) => ({
      ...form,
      role,
      platform_access: role === 'admin' && form.platform_access === 'mobile' ? 'both' : form.platform_access,
      client_panel_access: role === 'user' ? form.client_panel_access : true,
      client_edit_access: role === 'user' ? form.client_edit_access : false,
      service_sheet_access: role === 'user' ? form.service_sheet_access : true,
      client_financial_access: role === 'user' ? form.client_financial_access : true,
    }));
  };

  const setUserPlatform = (platformAccess: PlatformAccess) => {
    setUForm((form) => ({
      ...form,
      platform_access: form.role === 'admin' && platformAccess === 'mobile' ? 'both' : platformAccess,
    }));
  };

  const saveUser = async () => {
    if (!token) return setUError('Sesiunea de admin a expirat.');
    const username = uForm.username.trim();
    const displayName = uForm.display_name.trim();
    const password = uForm.password.trim();
    if (!username) return setUError('Username-ul este obligatoriu.');
    if (!displayName) return setUError('Numele afisat este obligatoriu.');
    if (!editingUser && !password) return setUError('Parola este obligatorie la creare.');
    if (uForm.role === 'admin' && uForm.platform_access === 'mobile') {
      return setUError('Conturile admin pot avea acces pe Desktop sau Desktop + Mobil.');
    }

    const protectedAdmin = isProtectedAdminUser(editingUser);
    setUError('');
    setULoading(true);
    try {
      const payload = {
        username: editingUser?.username || username,
        display_name: displayName,
        password: password || undefined,
        role: protectedAdmin ? 'admin' as UserRole : uForm.role,
        platform_access: protectedAdmin ? 'both' as PlatformAccess : uForm.platform_access,
        support_chat_access: protectedAdmin ? true : uForm.support_chat_access,
        client_panel_access: protectedAdmin ? true : uForm.role !== 'user' || uForm.client_panel_access,
        client_edit_access: protectedAdmin ? true : uForm.role === 'user' && uForm.client_edit_access,
        service_sheet_access: protectedAdmin ? true : uForm.role !== 'user' || uForm.service_sheet_access,
        client_financial_access: protectedAdmin ? true : uForm.role !== 'user' || uForm.client_financial_access,
        is_active: protectedAdmin ? true : uForm.is_active,
      };
      const saved = editingUser
        ? await updateAppUser(token, editingUser.id, payload)
        : await createAppUser(token, payload);
      setUsers((items) => {
        const exists = items.some((item) => item.id === saved.id);
        return exists
          ? items.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...items];
      });
      setUserModal(false);
    } catch (e: any) {
      setUError(e.message || 'Eroare la salvarea userului.');
    } finally {
      setULoading(false);
    }
  };

  const confirmDeleteUser = (row: AppUser) => {
    if (isProtectedAdminUser(row)) {
      Alert.alert('User protejat', 'Userul principal "admin" nu poate fi sters.');
      return;
    }
    if (row.id === user?.id) {
      Alert.alert('Actiune blocata', 'Nu iti poti sterge propriul cont.');
      return;
    }
    Alert.alert(
      'Sterge user',
      `Stergi userul "${row.display_name || row.username}"?`,
      [
        { text: 'Anuleaza', style: 'cancel' },
        {
          text: 'Sterge',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await deleteAppUser(token, row.id);
              setUsers((items) => items.filter((item) => item.id !== row.id));
              if (editingUser?.id === row.id) setUserModal(false);
            } catch (e: any) {
              Alert.alert('Eroare', e.message || 'Nu s-a putut sterge userul.');
            }
          },
        },
      ]
    );
  };

  const openLogoutPrompt = () => {
    setLogoutPromptVisible(true);
  };

  const closeLogoutPrompt = () => {
    if (logoutLoading) return;
    setLogoutPromptVisible(false);
  };

  const confirmLogout = async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      await logout();
    } finally {
      setLogoutLoading(false);
      setLogoutPromptVisible(false);
    }
  };

  const checkMobileUpdate = useCallback(async (source: 'manual' | 'auto' = 'manual') => {
    setMobileUpdateStatus('checking');
    setMobileUpdateMessage('Se verifica daca exista o versiune noua...');
    try {
      const info = await getMobileAppUpdate(mobileCurrentVersion);
      setMobileAvailableVersion(info.available_version || '');
      setMobileDownloadUrl(info.download_url || '');
      setMobileUpdateStatus(info.update_available ? 'available' : 'current');
      setMobileUpdateMessage(
        info.message ||
        (info.update_available
          ? `Versiunea ${info.available_version} este disponibila.`
          : `Ai deja cea mai noua versiune (${mobileCurrentVersion}).`)
      );
      const globallyAlertedVersion = (globalThis as GtrotsGlobal).__GTROTS_MOBILE_UPDATE_ALERTED_VERSION || '';
      if (
        source === 'auto' &&
        info.update_available &&
        info.available_version &&
        mobileUpdateAlertedVersionRef.current !== info.available_version &&
        globallyAlertedVersion !== info.available_version
      ) {
        mobileUpdateAlertedVersionRef.current = info.available_version;
        (globalThis as GtrotsGlobal).__GTROTS_MOBILE_UPDATE_ALERTED_VERSION = info.available_version;
        Alert.alert(
          'Actualizare disponibila',
          `Exista versiunea ${info.available_version} pentru G-Trots. Vrei sa o descarci acum?`,
          [
            { text: 'Mai tarziu', style: 'cancel' },
            {
              text: 'Descarca',
              onPress: async () => {
                const url = info.download_url || 'https://g-trots.ro/download-app/GTrotsApp.apk';
                try {
                  await Linking.openURL(url);
                } catch {
                  setMobileUpdateStatus('error');
                  setMobileUpdateMessage('Nu pot deschide link-ul de update.');
                }
              },
            },
          ]
        );
      }
    } catch (e: any) {
      setMobileUpdateStatus('error');
      setMobileUpdateMessage(e.message || 'Actualizarea nu a putut fi verificata.');
    }
  }, []);

  const openMobileUpdate = async () => {
    const url = mobileDownloadUrl || 'https://g-trots.ro/download-app/GTrotsApp.apk';
    setMobileUpdateStatus('opening');
    setMobileUpdateMessage('Se deschide descarcarea APK...');
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('Link-ul de descarcare nu poate fi deschis pe acest dispozitiv.');
      await Linking.openURL(url);
      setMobileUpdateStatus('available');
      setMobileUpdateMessage('Descarcarea a fost deschisa. Instaleaza APK-ul descarcat pentru update.');
    } catch (e: any) {
      setMobileUpdateStatus('error');
      setMobileUpdateMessage(e.message || 'Nu pot deschide link-ul de update.');
    }
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const timer = setTimeout(() => {
        if (active) checkMobileUpdate('auto');
      }, 250);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [checkMobileUpdate])
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.orange} size="large" />
      </View>
    );
  }

  const totalPct = profiles.reduce((s, p) => s + p.percentage, 0);
  const sortedUsers = [...users].sort((a, b) =>
    compareAlphabetically(a.display_name || a.username, b.display_name || b.username)
  );
  const sortedProfiles = [...profiles].sort((a, b) => compareAlphabetically(a.name, b.name));
  const sortedCollaborators = [...collaborators].sort((a, b) => compareAlphabetically(a.name, b.name));
  const sortedExpenses = [...expenses].sort((a, b) => compareAlphabetically(a.name, b.name));
  const sortedPricePresets = [...pricePresets].sort(
    (a, b) => Number(a.price || 0) - Number(b.price || 0) || compareAlphabetically(a.label, b.label)
  );
  const editingProtectedAdmin = isProtectedAdminUser(editingUser);
  const mobileUpdateBusy = mobileUpdateStatus === 'checking' || mobileUpdateStatus === 'opening';
  const mobileUpdateBadge = {
    idle: 'Pregatit',
    checking: 'Verificare',
    current: 'La zi',
    available: 'Update nou',
    opening: 'Descarcare',
    error: 'Eroare',
  }[mobileUpdateStatus];

  return (
    <View style={styles.container}>
      <Header
        title="Setari"
        right={
          <TouchableOpacity style={styles.logoutBtn} onPress={openLogoutPrompt} activeOpacity={0.8}>
            <LogOut size={18} color={Colors.orange} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.orange}
            colors={[Colors.orange]}
          />
        }>

        {/* About */}
        <View style={styles.aboutCard}>
          <Image source={appLogo} style={styles.aboutLogo} />
          <Text style={styles.aboutSub}>CRM Trotinete & Service</Text>
          <Text style={styles.aboutUser}>{user?.display_name || user?.username}</Text>
          <Text style={styles.aboutVersion}>v{mobileCurrentVersion}</Text>
        </View>

        <View style={[styles.mobileUpdateCard, mobileUpdateStatus === 'available' && styles.mobileUpdateCardAvailable]}>
          <View style={styles.mobileUpdateHead}>
            <View style={styles.mobileUpdateIcon}>
              <Download size={18} color={Colors.orange} />
            </View>
            <View style={styles.mobileUpdateCopy}>
              <Text style={styles.mobileUpdateTitle}>Actualizare aplicatie</Text>
              <Text style={styles.mobileUpdateSub}>G-Trots Android · versiunea ta {mobileCurrentVersion}</Text>
            </View>
            <View style={[
              styles.mobileUpdateBadge,
              mobileUpdateStatus === 'available' && styles.mobileUpdateBadgeHot,
              mobileUpdateStatus === 'error' && styles.mobileUpdateBadgeError,
            ]}>
              <Text style={[
                styles.mobileUpdateBadgeText,
                mobileUpdateStatus === 'available' && styles.mobileUpdateBadgeTextHot,
                mobileUpdateStatus === 'error' && styles.mobileUpdateBadgeTextError,
              ]}>
                {mobileUpdateBadge}
              </Text>
            </View>
          </View>
          <Text style={styles.mobileUpdateMessage}>{mobileUpdateMessage}</Text>
          {mobileAvailableVersion ? (
            <View style={styles.mobileUpdateVersionRow}>
              <Text style={styles.mobileUpdateVersionLabel}>Versiunea ta</Text>
              <Text style={styles.mobileUpdateVersionValue}>v{mobileCurrentVersion}</Text>
              <Text style={styles.mobileUpdateArrow}>→</Text>
              <Text style={styles.mobileUpdateVersionLabel}>Noua</Text>
              <Text style={[styles.mobileUpdateVersionValue, styles.mobileUpdateVersionNew]}>
                v{mobileAvailableVersion}
              </Text>
            </View>
          ) : null}
          <View style={styles.mobileUpdateActions}>
            <TouchableOpacity
              style={[styles.mobileUpdateGhostBtn, mobileUpdateBusy && styles.actionBtnDisabled]}
              onPress={() => checkMobileUpdate('manual')}
              disabled={mobileUpdateBusy}>
              {mobileUpdateStatus === 'checking' ? (
                <ActivityIndicator color={Colors.orange} size="small" />
              ) : (
                <RefreshCcw size={15} color={Colors.orange} />
              )}
              <Text style={styles.mobileUpdateGhostText}>
                {mobileUpdateStatus === 'checking' ? 'Se verifica...' : 'Verifica actualizari'}
              </Text>
            </TouchableOpacity>
            {mobileUpdateStatus === 'available' || mobileUpdateStatus === 'opening' ? (
              <TouchableOpacity
                style={[styles.mobileUpdatePrimaryBtn, mobileUpdateBusy && styles.actionBtnDisabled]}
                onPress={openMobileUpdate}
                disabled={mobileUpdateBusy}>
                {mobileUpdateStatus === 'opening' ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Download size={15} color={Colors.white} />
                )}
                <Text style={styles.mobileUpdatePrimaryText}>
                  {mobileUpdateStatus === 'opening' ? 'Se deschide...' : 'Actualizeaza'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <WhatsAppPredefinedMessages />

        {user?.role === 'admin' && (
          <>
            <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpandUsers((v) => !v)}>
              <Users size={16} color={Colors.orange} />
              <Text style={styles.sectionTitle}>User Login System</Text>
              <View style={styles.sectionCount}>
                <Text style={styles.sectionCountText}>{users.length}</Text>
              </View>
              {expandUsers ? (
                <ChevronUp size={16} color={Colors.textMuted} />
              ) : (
                <ChevronDown size={16} color={Colors.textMuted} />
              )}
            </TouchableOpacity>

            {expandUsers && (
              <View style={styles.sectionContent}>
                <View style={styles.userSummaryGrid}>
                  <View style={styles.userSummaryTile}>
                    <Users size={15} color={Colors.orange} />
                    <Text style={styles.userSummaryValue}>{users.length}</Text>
                    <Text style={styles.userSummaryLabel}>Total</Text>
                  </View>
                  <View style={styles.userSummaryTile}>
                    <Monitor size={15} color={Colors.orange} />
                    <Text style={styles.userSummaryValue}>
                      {users.filter((row) => ['desktop', 'both'].includes(row.platform_access)).length}
                    </Text>
                    <Text style={styles.userSummaryLabel}>Desktop</Text>
                  </View>
                  <View style={styles.userSummaryTile}>
                    <Smartphone size={15} color={Colors.orange} />
                    <Text style={styles.userSummaryValue}>
                      {users.filter((row) => ['mobile', 'both'].includes(row.platform_access)).length}
                    </Text>
                    <Text style={styles.userSummaryLabel}>Mobil</Text>
                  </View>
                  <View style={styles.userSummaryTile}>
                    <MessageCircle size={15} color={Colors.orange} />
                    <Text style={styles.userSummaryValue}>{users.filter((row) => row.support_chat_access).length}</Text>
                    <Text style={styles.userSummaryLabel}>Support</Text>
                  </View>
                  <View style={styles.userSummaryTile}>
                    <Users size={15} color={Colors.orange} />
                    <Text style={styles.userSummaryValue}>
                      {users.filter((row) => row.role !== 'user' || row.client_panel_access !== false).length}
                    </Text>
                    <Text style={styles.userSummaryLabel}>Clienti</Text>
                  </View>
                </View>

                {sortedUsers.length === 0 && (
                  <Text style={styles.emptyText}>Niciun user creat.</Text>
                )}

                {sortedUsers.map((row) => {
                  const protectedAdmin = isProtectedAdminUser(row);
                  const canDeleteUser = !protectedAdmin && row.id !== user?.id;
                  const active = Boolean(row.is_active);
                  return (
                    <View
                      key={row.id}
                      style={[
                        styles.userCard,
                        protectedAdmin && styles.userCardPinned,
                        !active && styles.userCardInactive,
                      ]}>
                      <View style={styles.userCardTop}>
                        <View style={[styles.userAvatar, row.support_chat_access && styles.userAvatarAgent]}>
                          <Text style={styles.userAvatarText}>{userInitials(row)}</Text>
                        </View>
                        <View style={styles.userCardMain}>
                          <View style={styles.userTitleRow}>
                            <Text style={styles.userName} numberOfLines={1}>
                              {row.display_name || row.username}
                            </Text>
                            <View style={[styles.statusPill, active ? styles.statusPillActive : styles.statusPillInactive]}>
                              {active ? (
                                <CheckCircle2 size={11} color={Colors.success} />
                              ) : (
                                <XCircle size={11} color={Colors.error} />
                              )}
                              <Text style={[styles.statusPillText, active ? styles.statusTextActive : styles.statusTextInactive]}>
                                {active ? 'Activ' : 'Inactiv'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.userUsername}>@{row.username}</Text>
                        </View>
                      </View>

                      <View style={styles.userChipRow}>
                        <View style={styles.userChip}>
                          <ShieldCheck size={12} color={Colors.orange} />
                          <Text style={styles.userChipText}>{roleLabel(row.role)}</Text>
                        </View>
                        <View style={styles.userChip}>
                          {row.platform_access === 'mobile' ? (
                            <Smartphone size={12} color={Colors.orange} />
                          ) : (
                            <Monitor size={12} color={Colors.orange} />
                          )}
                          <Text style={styles.userChipText}>{platformLabel(row.platform_access)}</Text>
                        </View>
                        {row.support_chat_access ? (
                          <View style={[styles.userChip, styles.userChipSupport]}>
                            <MessageCircle size={12} color={Colors.success} />
                            <Text style={[styles.userChipText, styles.userChipTextSuccess]}>Agent Support</Text>
                          </View>
                        ) : null}
                        {row.role === 'user' && row.client_panel_access !== false ? (
                          <View style={[styles.userChip, styles.userChipSupport]}>
                            <Users size={12} color={Colors.success} />
                            <Text style={[styles.userChipText, styles.userChipTextSuccess]}>Panou clienti</Text>
                          </View>
                        ) : null}
                        {row.role === 'user' && row.client_edit_access ? (
                          <View style={[styles.userChip, styles.userChipSupport]}>
                            <Pencil size={12} color={Colors.success} />
                            <Text style={[styles.userChipText, styles.userChipTextSuccess]}>Editare clienti</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.addedAtRow}>
                        <CalendarClock size={12} color={Colors.textMuted} />
                        <Text style={styles.addedAtText}>Adaugat: {formatAddedAt(row.created_at)}</Text>
                      </View>

                      <View style={styles.itemActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => openEditUser(row)}>
                          <Pencil size={15} color={Colors.orange} />
                          <Text style={styles.actionText}>Editeaza</Text>
                        </TouchableOpacity>
                        {canDeleteUser ? (
                          <TouchableOpacity style={styles.actionBtnDanger} onPress={() => confirmDeleteUser(row)}>
                            <Trash2 size={15} color={Colors.error} />
                            <Text style={styles.actionTextDanger}>Sterge</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })}

                <TouchableOpacity style={styles.addItemBtn} onPress={openNewUser}>
                  <Plus size={16} color={Colors.orange} />
                  <Text style={styles.addItemText}>Adauga User</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {user?.role !== 'user' && <>
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpandPricePresets((v) => !v)}>
          <CircleDollarSign size={16} color={Colors.orange} />
          <Text style={styles.sectionTitle}>Preturi predefinite</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{pricePresets.length}</Text>
          </View>
          {expandPricePresets ? (
            <ChevronUp size={16} color={Colors.textMuted} />
          ) : (
            <ChevronDown size={16} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        {expandPricePresets && (
          <View style={styles.sectionContent}>
            <View style={styles.infoCard}>
              <CircleDollarSign size={14} color={Colors.orange} />
              <Text style={styles.infoText}>
                Preturile salvate apar la scanare si in financiar, dar pot fi modificate manual pe client.
              </Text>
            </View>
            {!sortedPricePresets.length ? (
              <Text style={styles.emptyText}>Niciun pret predefinit configurat.</Text>
            ) : null}
            {sortedPricePresets.map((preset) => (
              <View key={preset.id} style={[styles.itemCard, { borderLeftColor: Colors.success }]}>
                <View style={styles.itemMain}>
                  <View style={[styles.colorCircle, { backgroundColor: Colors.success }]} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{preset.label}</Text>
                    <Text style={styles.itemRole}>Disponibil la scanare si in financiar</Text>
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: Colors.successDim }]}>
                    <Text style={[styles.pctText, { color: Colors.success }]}>
                      {Number(preset.price || 0).toFixed(2)} RON
                    </Text>
                  </View>
                </View>
                <View style={styles.addedAtRow}>
                  <CalendarClock size={12} color={Colors.success} />
                  <Text style={styles.addedAtText}>Adaugat: {formatAddedAt(preset.created_at)}</Text>
                </View>
                <View style={[styles.itemActions, styles.expenseItemActions]}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEditPricePreset(preset)}>
                    <Pencil size={15} color={Colors.orange} />
                    <Text style={styles.actionText}>Editeaza</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnDanger} onPress={() => confirmDeletePricePreset(preset)}>
                    <Trash2 size={15} color={Colors.error} />
                    <Text style={styles.actionTextDanger}>Sterge</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.addItemBtn} onPress={openNewPricePreset}>
              <Plus size={16} color={Colors.orange} />
              <Text style={styles.addItemText}>Adauga pret predefinit</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Agents / Profiles section */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpandProfiles((v) => !v)}>
          <Percent size={16} color={Colors.orange} />
          <Text style={styles.sectionTitle}>Agenti & Profiluri Afiliere</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{profiles.length}</Text>
          </View>
          {expandProfiles ? (
            <ChevronUp size={16} color={Colors.textMuted} />
          ) : (
            <ChevronDown size={16} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        {expandProfiles && (
          <View style={styles.sectionContent}>
            <View style={styles.infoCard}>
              <Info size={14} color={Colors.orange} />
              <Text style={styles.infoText}>
                Agentii de vanzari se identifica prin profilurile de mai jos.
                Fiecare profil are un procent de comision din vanzarile aduse.
              </Text>
            </View>

            {profiles.length === 0 && (
              <Text style={styles.emptyText}>Niciun agent / profil adaugat.</Text>
            )}
            {sortedProfiles.map((p) => (
              <View key={p.id} style={[styles.itemCard, { borderLeftColor: p.color }]}>
                <View style={styles.itemMain}>
                  <View style={[styles.colorCircle, { backgroundColor: p.color }]} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{p.name}</Text>
                    {p.role ? <Text style={styles.itemRole}>{p.role}</Text> : null}
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: p.color + '22' }]}>
                    <Text style={[styles.pctText, { color: p.color }]}>{p.percentage}%</Text>
                  </View>
                </View>

                {/* Mini earnings preview */}
                <View style={styles.earningsPreview}>
                  <View style={styles.progressBar}>
                    <View
                      style={[styles.progressFill, { width: `${p.percentage}%` as any, backgroundColor: p.color }]}
                    />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={[styles.progressLabel, { color: p.color }]}>
                      {p.name}: {p.percentage}%
                    </Text>
                    <Text style={[styles.progressLabel, { color: Colors.orange }]}>
                      G-Trots: {(100 - p.percentage).toFixed(0)}%
                    </Text>
                  </View>
                </View>

                <View style={styles.addedAtRow}>
                  <CalendarClock size={12} color={p.color} />
                  <Text style={styles.addedAtText}>Adaugat: {formatAddedAt(p.created_at)}</Text>
                </View>

                <View style={styles.itemActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEditProfile(p)}>
                    <Pencil size={15} color={Colors.orange} />
                    <Text style={styles.actionText}>Editeaza</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnDanger} onPress={() => confirmDeleteProfile(p)}>
                    <Trash2 size={15} color={Colors.error} />
                    <Text style={styles.actionTextDanger}>Sterge</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={openNewProfile}>
              <Plus size={16} color={Colors.orange} />
              <Text style={styles.addItemText}>Adauga Agent / Profil</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Collaborators section */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpandCollaborators((v) => !v)}>
          <Wrench size={16} color={Colors.orange} />
          <Text style={styles.sectionTitle}>Colaboratori</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{collaborators.length}</Text>
          </View>
          {expandCollaborators ? (
            <ChevronUp size={16} color={Colors.textMuted} />
          ) : (
            <ChevronDown size={16} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        {expandCollaborators && (
          <View style={styles.sectionContent}>
            {collaborators.length === 0 && (
              <Text style={styles.emptyText}>Niciun colaborator adaugat.</Text>
            )}
            {sortedCollaborators.map((c) => (
              <View key={c.id} style={[styles.itemCard, { borderLeftColor: c.color }]}>
                <View style={styles.itemMain}>
                  <View style={[styles.colorCircle, { backgroundColor: c.color }]} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{c.name}</Text>
                    {c.role ? <Text style={styles.itemRole}>{c.role}</Text> : null}
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: c.color + '22' }]}>
                    <Text style={[styles.pctText, { color: c.color }]}>
                      {Number(c.percentage || 0) > 0 ? `${Number(c.percentage).toFixed(2)}% NET` : 'Suma fixa'}
                    </Text>
                  </View>
                </View>

                {c.phone || c.email ? (
                  <View style={styles.contactDetails}>
                    {c.phone ? (
                      <View style={styles.contactDetail}>
                        <Phone size={12} color={c.color} />
                        <Text style={styles.contactDetailText}>{c.phone}</Text>
                      </View>
                    ) : null}
                    {c.email ? (
                      <View style={styles.contactDetail}>
                        <Mail size={12} color={c.color} />
                        <Text style={styles.contactDetailText} numberOfLines={1}>{c.email}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.addedAtRow}>
                  <CalendarClock size={12} color={c.color} />
                  <Text style={styles.addedAtText}>Adaugat: {formatAddedAt(c.created_at)}</Text>
                </View>

                <View style={styles.itemActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEditCollaborator(c)}>
                    <Pencil size={15} color={Colors.orange} />
                    <Text style={styles.actionText}>Editeaza</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnDanger} onPress={() => confirmDeleteCollaborator(c)}>
                    <Trash2 size={15} color={Colors.error} />
                    <Text style={styles.actionTextDanger}>Sterge</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={openNewCollaborator}>
              <Plus size={16} color={Colors.orange} />
              <Text style={styles.addItemText}>Adauga Colaborator</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpandExpenses((value) => !value)}>
          <ReceiptText size={16} color={Colors.orange} />
          <Text style={styles.sectionTitle}>Cheltuieli</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{expenses.length}</Text>
          </View>
          {expandExpenses ? (
            <ChevronUp size={16} color={Colors.textMuted} />
          ) : (
            <ChevronDown size={16} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        {expandExpenses && (
          <View style={styles.sectionContent}>
            {!sortedExpenses.length ? (
              <Text style={styles.emptyText}>Nicio cheltuiala configurata.</Text>
            ) : null}
            {sortedExpenses.map((expense) => (
              <View key={expense.id} style={[styles.itemCard, { borderLeftColor: expense.color }]}>
                <View style={styles.itemMain}>
                  <View style={[styles.colorCircle, { backgroundColor: expense.color }]} />
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{expense.name}</Text>
                    <Text style={styles.itemRole}>Disponibila la adaugare si editare client</Text>
                  </View>
                  <View style={[styles.pctBadge, { backgroundColor: expense.color + '22' }]}>
                    <ReceiptText size={14} color={expense.color} />
                  </View>
                </View>
                <View style={styles.addedAtRow}>
                  <CalendarClock size={12} color={expense.color} />
                  <Text style={styles.addedAtText}>Adaugat: {formatAddedAt(expense.created_at)}</Text>
                </View>
                <View style={[styles.itemActions, styles.expenseItemActions]}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEditExpense(expense)}>
                    <Pencil size={15} color={Colors.orange} />
                    <Text style={styles.actionText}>Editeaza</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtnDanger} onPress={() => confirmDeleteExpense(expense)}>
                    <Trash2 size={15} color={Colors.error} />
                    <Text style={styles.actionTextDanger}>Sterge</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.addItemBtn} onPress={openNewExpense}>
              <Plus size={16} color={Colors.orange} />
              <Text style={styles.addItemText}>Adauga cheltuiala</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpandCompany((v) => !v)}>
          <Building2 size={16} color={Colors.orange} />
          <Text style={styles.sectionTitle}>Datele firmei</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>API</Text>
          </View>
          {expandCompany ? (
            <ChevronUp size={16} color={Colors.textMuted} />
          ) : (
            <ChevronDown size={16} color={Colors.textMuted} />
          )}
        </TouchableOpacity>

        {expandCompany && (
          <View style={styles.sectionContent}>
            <View style={styles.infoCard}>
              <Building2 size={14} color={Colors.orange} />
              <Text style={styles.infoText}>
                Completeaza datele firmei o singura data. Desktopul si viitoarea versiune mobila le citesc din acelasi API.
              </Text>
            </View>
            {companyError ? <Text style={styles.modalError}>{companyError}</Text> : null}
            <Text style={styles.companyStatusText}>{companyMessage}</Text>

            <Text style={styles.modalLabel}>Denumire firma</Text>
            <TextInput
              style={styles.companyInput}
              value={companyForm.company_name}
              onChangeText={(value) => updateCompanyField('company_name', value)}
              placeholder="Ex: Cab IT Expert SRL"
              placeholderTextColor={Colors.textMuted}
            />

            <View style={styles.companyGrid}>
              <View style={styles.companyGridItem}>
                <Text style={styles.modalLabel}>CIF / CUI</Text>
                <TextInput
                  style={styles.companyInput}
                  value={companyForm.fiscal_code}
                  onChangeText={(value) => updateCompanyField('fiscal_code', value)}
                  placeholder="RO..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.companyGridItem}>
                <Text style={styles.modalLabel}>Nr. Reg. Com.</Text>
                <TextInput
                  style={styles.companyInput}
                  value={companyForm.registration_number}
                  onChangeText={(value) => updateCompanyField('registration_number', value)}
                  placeholder="J..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <Text style={styles.modalLabel}>Adresa</Text>
            <View style={styles.companyInputIconWrap}>
              <MapPin size={15} color={Colors.orange} />
              <TextInput
                style={[styles.companyInput, styles.companyInputInIcon, styles.companyTextArea]}
                value={companyForm.address}
                onChangeText={(value) => updateCompanyField('address', value)}
                placeholder="Sediu / punct de lucru"
                placeholderTextColor={Colors.textMuted}
                multiline
              />
            </View>

            <View style={styles.companyGrid}>
              <View style={styles.companyGridItem}>
                <Text style={styles.modalLabel}>Telefon</Text>
                <TextInput
                  style={styles.companyInput}
                  value={companyForm.phone}
                  onChangeText={(value) => updateCompanyField('phone', value)}
                  placeholder="07..."
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.companyGridItem}>
                <Text style={styles.modalLabel}>Email</Text>
                <TextInput
                  style={styles.companyInput}
                  value={companyForm.email}
                  onChangeText={(value) => updateCompanyField('email', value)}
                  placeholder="contact@firma.ro"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <Text style={styles.modalLabel}>Website</Text>
            <View style={styles.companyInputIconWrap}>
              <Globe2 size={15} color={Colors.orange} />
              <TextInput
                style={[styles.companyInput, styles.companyInputInIcon]}
                value={companyForm.website}
                onChangeText={(value) => updateCompanyField('website', value)}
                placeholder="https://firma.ro"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.companyGrid}>
              <View style={styles.companyGridItem}>
                <Text style={styles.modalLabel}>Banca</Text>
                <View style={styles.companyInputIconWrap}>
                  <Landmark size={15} color={Colors.orange} />
                  <TextInput
                    style={[styles.companyInput, styles.companyInputInIcon]}
                    value={companyForm.bank_name}
                    onChangeText={(value) => updateCompanyField('bank_name', value)}
                    placeholder="Banca"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              </View>
              <View style={styles.companyGridItem}>
                <Text style={styles.modalLabel}>IBAN</Text>
                <TextInput
                  style={styles.companyInput}
                  value={companyForm.iban}
                  onChangeText={(value) => updateCompanyField('iban', value)}
                  placeholder="RO..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <Text style={styles.modalLabel}>Stampila firma</Text>
            <View style={styles.stampCard}>
              {companyForm.stamp_image ? (
                <Image source={{ uri: companyForm.stamp_image }} style={styles.stampPreview} resizeMode="contain" />
              ) : (
                <View style={styles.stampEmpty}>
                  <ReceiptText size={24} color={Colors.textMuted} />
                  <Text style={styles.stampEmptyText}>Nu ai selectat stampila</Text>
                </View>
              )}
              <View style={styles.stampActions}>
                <TouchableOpacity style={styles.stampBtn} onPress={pickCompanyStamp}>
                  <Upload size={15} color={Colors.orange} />
                  <Text style={styles.stampBtnText}>{companyForm.stamp_image ? 'Schimba stampila' : 'Adauga fisier'}</Text>
                </TouchableOpacity>
                {companyForm.stamp_image ? (
                  <TouchableOpacity style={styles.stampBtnDanger} onPress={clearCompanyStamp}>
                    <Trash2 size={15} color={Colors.error} />
                    <Text style={styles.stampBtnDangerText}>Sterge</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <TouchableOpacity style={styles.companySaveBtn} onPress={saveCompany} disabled={companySaving}>
              {companySaving ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <CheckCircle2 size={16} color={Colors.white} />
              )}
              <Text style={styles.companySaveText}>{companySaving ? 'Se salveaza...' : 'Salveaza datele firmei'}</Text>
            </TouchableOpacity>
          </View>
        )}
        </>}

        {user?.role === 'admin' && (
          <SystemDatabaseSettings token={token} onSystemChanged={logout} />
        )}
      </ScrollView>

      {/* Profile / Agent Modal */}
      <Modal visible={profileModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
          <SwipeDownSheet
            visible={profileModal}
            onClose={() => setProfileModal(false)}
            disabled={pLoading}
            style={styles.modalSheet}>
            <KeyboardAwareScrollView
              contentContainerStyle={styles.modalContent}
              extraScrollHeight={120}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingProfile ? 'Editeaza Agent' : 'Agent Nou'}
              </Text>

              {pError ? <Text style={styles.modalError}>{pError}</Text> : null}

              <Text style={styles.modalLabel}>Nume Agent *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Florin"
                placeholderTextColor={Colors.textMuted}
                value={pForm.name}
                onChangeText={(v) => setPForm((f) => ({ ...f, name: v }))}
              />

              <Text style={styles.modalLabel}>Functie / Rol</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Agent Vanzari"
                placeholderTextColor={Colors.textMuted}
                value={pForm.role}
                onChangeText={(v) => setPForm((f) => ({ ...f, role: v }))}
              />

              <Text style={styles.modalLabel}>Procent Comision (%)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: 30"
                placeholderTextColor={Colors.textMuted}
                value={pForm.percentage}
                onChangeText={(v) => setPForm((f) => ({ ...f, percentage: v }))}
                keyboardType="numeric"
              />
              {pForm.percentage ? (
                <View style={styles.pctPreview}>
                  <View style={[styles.pctPreviewBar]}>
                    <View
                      style={[
                        styles.pctPreviewFill,
                        { width: `${Math.min(parseFloat(pForm.percentage) || 0, 100)}%` as any },
                      ]}
                    />
                  </View>
                  <View style={styles.pctPreviewLabels}>
                    <Text style={styles.pctPreviewLabelAgent}>
                      Agent: {Math.min(parseFloat(pForm.percentage) || 0, 100).toFixed(0)}%
                    </Text>
                    <Text style={styles.pctPreviewLabelGt}>
                      G-Trots: {(100 - Math.min(parseFloat(pForm.percentage) || 0, 100)).toFixed(0)}%
                    </Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.modalLabel}>Culoare Identificare</Text>
              <View style={styles.colorPicker}>
                {PRESET_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      pForm.color === c && styles.colorSwatchActive,
                    ]}
                    onPress={() => setPForm((f) => ({ ...f, color: c }))}
                  />
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setProfileModal(false)}>
                  <Text style={styles.modalCancelText}>Anuleaza</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={saveProfile} disabled={pLoading}>
                  {pLoading ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.modalSaveText}>Salveaza</Text>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          </SwipeDownSheet>
        </KeyboardAvoidingView>
      </Modal>

      {/* Collaborator Modal */}
      <Modal visible={collaboratorModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
          <SwipeDownSheet
            visible={collaboratorModal}
            onClose={() => setCollaboratorModal(false)}
            disabled={cLoading}
            style={styles.modalSheet}>
            <KeyboardAwareScrollView
              contentContainerStyle={styles.modalContent}
              extraScrollHeight={120}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingCollaborator ? 'Editeaza Colaborator' : 'Colaborator Nou'}
              </Text>

              {cError ? <Text style={styles.modalError}>{cError}</Text> : null}

              <Text style={styles.modalLabel}>Nume Colaborator *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Mihai"
                placeholderTextColor={Colors.textMuted}
                value={cForm.name}
                onChangeText={(v) => setCForm((f) => ({ ...f, name: v }))}
              />

              <Text style={styles.modalLabel}>Functie / Rol</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Mecanic"
                placeholderTextColor={Colors.textMuted}
                value={cForm.role}
                onChangeText={(v) => setCForm((f) => ({ ...f, role: v }))}
              />

              <Text style={styles.modalLabel}>Numar Telefon (optional)</Text>
              <View style={styles.contactInputWrap}>
                <Phone size={17} color={Colors.orange} />
                <TextInput
                  style={styles.contactInput}
                  placeholder="Ex: 0722 123 456"
                  placeholderTextColor={Colors.textMuted}
                  value={cForm.phone}
                  onChangeText={(v) => setCForm((f) => ({ ...f, phone: v }))}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.modalLabel}>Email (optional)</Text>
              <View style={styles.contactInputWrap}>
                <Mail size={17} color={Colors.orange} />
                <TextInput
                  style={styles.contactInput}
                  placeholder="Ex: colaborator@email.ro"
                  placeholderTextColor={Colors.textMuted}
                  value={cForm.email}
                  onChangeText={(v) => setCForm((f) => ({ ...f, email: v }))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={styles.modalLabel}>Procent implicit din NET (%)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: 50"
                placeholderTextColor={Colors.textMuted}
                value={cForm.percentage}
                onChangeText={(v) => setCForm((f) => ({ ...f, percentage: v }))}
                keyboardType="numeric"
              />
              <Text style={styles.modalHelper}>
                Se aplica automat cand adaugi colaboratorul la client si poate fi schimbat pentru clientul respectiv.
              </Text>

              <Text style={styles.modalLabel}>Culoare Identificare</Text>
              <View style={styles.colorPicker}>
                {PRESET_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      cForm.color === c && styles.colorSwatchActive,
                    ]}
                    onPress={() => setCForm((f) => ({ ...f, color: c }))}
                  />
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setCollaboratorModal(false)}>
                  <Text style={styles.modalCancelText}>Anuleaza</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={saveCollaborator} disabled={cLoading}>
                  {cLoading ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.modalSaveText}>Salveaza</Text>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          </SwipeDownSheet>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={expenseModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
          <SwipeDownSheet
            visible={expenseModal}
            onClose={() => setExpenseModal(false)}
            disabled={expenseLoading}
            style={styles.modalSheet}>
            <KeyboardAwareScrollView
              contentContainerStyle={styles.modalContent}
              extraScrollHeight={120}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingExpense ? 'Editeaza cheltuiala' : 'Cheltuiala noua'}
              </Text>
              {expenseError ? <Text style={styles.modalError}>{expenseError}</Text> : null}
              <Text style={styles.modalLabel}>Denumire *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Transport, Curier, Consumabile"
                placeholderTextColor={Colors.textMuted}
                value={expenseForm.name}
                onChangeText={(name) => setExpenseForm((form) => ({ ...form, name }))}
              />
              <Text style={styles.modalLabel}>Culoare identificare</Text>
              <View style={styles.colorPicker}>
                {PRESET_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      expenseForm.color === color && styles.colorSwatchActive,
                    ]}
                    onPress={() => setExpenseForm((form) => ({ ...form, color }))}
                  />
                ))}
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setExpenseModal(false)}>
                  <Text style={styles.modalCancelText}>Anuleaza</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={saveExpense} disabled={expenseLoading}>
                  {expenseLoading ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.modalSaveText}>Salveaza</Text>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          </SwipeDownSheet>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={pricePresetModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
          <SwipeDownSheet
            visible={pricePresetModal}
            onClose={() => setPricePresetModal(false)}
            disabled={pricePresetLoading}
            style={styles.modalSheet}>
            <KeyboardAwareScrollView
              contentContainerStyle={styles.modalContent}
              extraScrollHeight={120}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingPricePreset ? 'Editeaza pret predefinit' : 'Pret predefinit nou'}
              </Text>
              {pricePresetError ? <Text style={styles.modalError}>{pricePresetError}</Text> : null}
              <Text style={styles.modalLabel}>Label *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Revizie standard"
                placeholderTextColor={Colors.textMuted}
                value={pricePresetForm.label}
                onChangeText={(label) => setPricePresetForm((form) => ({ ...form, label }))}
              />
              <Text style={styles.modalLabel}>Pret (RON) *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                value={pricePresetForm.price}
                onChangeText={(price) => setPricePresetForm((form) => ({ ...form, price }))}
                keyboardType="numeric"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setPricePresetModal(false)}>
                  <Text style={styles.modalCancelText}>Anuleaza</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={savePricePreset} disabled={pricePresetLoading}>
                  {pricePresetLoading ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.modalSaveText}>Salveaza</Text>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          </SwipeDownSheet>
        </KeyboardAvoidingView>
      </Modal>

      {/* User Login System Modal */}
      <Modal visible={userModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
          <SwipeDownSheet
            visible={userModal}
            onClose={() => setUserModal(false)}
            disabled={uLoading}
            style={styles.modalSheet}>
            <KeyboardAwareScrollView
              contentContainerStyle={styles.modalContent}
              extraScrollHeight={130}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingUser ? 'Editeaza User' : 'User Nou'}
              </Text>

              {uError ? <Text style={styles.modalError}>{uError}</Text> : null}

              {editingProtectedAdmin ? (
                <View style={styles.protectedNotice}>
                  <ShieldCheck size={15} color={Colors.orange} />
                  <Text style={styles.protectedNoticeText}>
                    Contul principal admin ramane protejat si are acces Desktop + Mobil.
                  </Text>
                </View>
              ) : null}

              <Text style={styles.modalLabel}>Nume afisat *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Alexandru"
                placeholderTextColor={Colors.textMuted}
                value={uForm.display_name}
                onChangeText={(v) => setUForm((form) => ({ ...form, display_name: v }))}
              />

              <Text style={styles.modalLabel}>Username *</Text>
              <View style={[styles.contactInputWrap, editingUser && styles.inputDisabled]}>
                <Users size={17} color={Colors.orange} />
                <TextInput
                  style={styles.contactInput}
                  placeholder="Ex: alex"
                  placeholderTextColor={Colors.textMuted}
                  value={uForm.username}
                  onChangeText={(v) => setUForm((form) => ({ ...form, username: v }))}
                  editable={!editingUser}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={styles.modalLabel}>{editingUser ? 'Parola noua (optional)' : 'Parola *'}</Text>
              <View style={styles.contactInputWrap}>
                <KeyRound size={17} color={Colors.orange} />
                <TextInput
                  style={styles.contactInput}
                  placeholder={editingUser ? 'Lasa gol daca nu schimbi parola' : 'Parola contului'}
                  placeholderTextColor={Colors.textMuted}
                  value={uForm.password}
                  onChangeText={(v) => setUForm((form) => ({ ...form, password: v }))}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Text style={styles.modalLabel}>Rol</Text>
              <View style={styles.segmentGrid}>
                {ROLE_OPTIONS.map((option) => {
                  const active = uForm.role === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.segmentOption,
                        active && styles.segmentOptionActive,
                        editingProtectedAdmin && styles.segmentOptionDisabled,
                      ]}
                      disabled={editingProtectedAdmin}
                      onPress={() => setUserRole(option.value)}>
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.modalLabel}>Acces platforma</Text>
              <View style={styles.segmentGrid}>
                {PLATFORM_OPTIONS.map((option) => {
                  const active = uForm.platform_access === option.value;
                  const disabled = editingProtectedAdmin || (uForm.role === 'admin' && option.value === 'mobile');
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.segmentOption,
                        active && styles.segmentOptionActive,
                        disabled && styles.segmentOptionDisabled,
                      ]}
                      disabled={disabled}
                      onPress={() => setUserPlatform(option.value)}>
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.toggleRow, editingProtectedAdmin && styles.toggleRowDisabled]}
                disabled={editingProtectedAdmin}
                onPress={() => setUForm((form) => ({ ...form, support_chat_access: !form.support_chat_access }))}>
                <View style={[styles.toggleIcon, uForm.support_chat_access && styles.toggleIconActive]}>
                  <MessageCircle size={15} color={uForm.support_chat_access ? Colors.success : Colors.textMuted} />
                </View>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleTitle}>Agent Support</Text>
                  <Text style={styles.toggleSubtitle}>Poate prelua si raspunde la chat-uri.</Text>
                </View>
                <View style={[styles.switchTrack, uForm.support_chat_access && styles.switchTrackActive]}>
                  <View style={[styles.switchThumb, uForm.support_chat_access && styles.switchThumbActive]} />
                </View>
              </TouchableOpacity>

              {uForm.role === 'user' ? (
                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setUForm((form) => ({ ...form, client_panel_access: !form.client_panel_access }))}>
                  <View style={[styles.toggleIcon, uForm.client_panel_access && styles.toggleIconActive]}>
                    <Users size={15} color={uForm.client_panel_access ? Colors.success : Colors.textMuted} />
                  </View>
                  <View style={styles.toggleCopy}>
                    <Text style={styles.toggleTitle}>Panou clienti</Text>
                    <Text style={styles.toggleSubtitle}>Afiseaza tab-ul Clienti si lista de clienti pe mobil si desktop.</Text>
                  </View>
                  <View style={[styles.switchTrack, uForm.client_panel_access && styles.switchTrackActive]}>
                    <View style={[styles.switchThumb, uForm.client_panel_access && styles.switchThumbActive]} />
                  </View>
                </TouchableOpacity>
              ) : null}

              {uForm.role === 'user' ? (
                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setUForm((form) => ({ ...form, client_edit_access: !form.client_edit_access }))}>
                  <View style={[styles.toggleIcon, uForm.client_edit_access && styles.toggleIconActive]}>
                    <Pencil size={15} color={uForm.client_edit_access ? Colors.success : Colors.textMuted} />
                  </View>
                  <View style={styles.toggleCopy}>
                    <Text style={styles.toggleTitle}>Editare clienti</Text>
                    <Text style={styles.toggleSubtitle}>Permite userului sa modifice clienti.</Text>
                  </View>
                  <View style={[styles.switchTrack, uForm.client_edit_access && styles.switchTrackActive]}>
                    <View style={[styles.switchThumb, uForm.client_edit_access && styles.switchThumbActive]} />
                  </View>
                </TouchableOpacity>
              ) : null}
              {uForm.role === 'user' ? (
                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setUForm((form) => ({ ...form, service_sheet_access: !form.service_sheet_access }))}>
                  <View style={[styles.toggleIcon, uForm.service_sheet_access && styles.toggleIconActive]}>
                    <FileText size={15} color={uForm.service_sheet_access ? Colors.success : Colors.textMuted} />
                  </View>
                  <View style={styles.toggleCopy}>
                    <Text style={styles.toggleTitle}>Afisare fise de service</Text>
                    <Text style={styles.toggleSubtitle}>Afiseaza tab-ul, accesul din client si formularul de service pe mobil si desktop.</Text>
                  </View>
                  <View style={[styles.switchTrack, uForm.service_sheet_access && styles.switchTrackActive]}>
                    <View style={[styles.switchThumb, uForm.service_sheet_access && styles.switchThumbActive]} />
                  </View>
                </TouchableOpacity>
              ) : null}
              {uForm.role === 'user' ? (
                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setUForm((form) => ({ ...form, client_financial_access: !form.client_financial_access }))}>
                  <View style={[styles.toggleIcon, uForm.client_financial_access && styles.toggleIconActive]}>
                    <Eye size={15} color={uForm.client_financial_access ? Colors.success : Colors.textMuted} />
                  </View>
                  <View style={styles.toggleCopy}>
                    <Text style={styles.toggleTitle}>Vizualizare costuri clienti</Text>
                    <Text style={styles.toggleSubtitle}>Poate vedea preturi, incasari, costuri interne si sumele din fisele redeschise.</Text>
                  </View>
                  <View style={[styles.switchTrack, uForm.client_financial_access && styles.switchTrackActive]}>
                    <View style={[styles.switchThumb, uForm.client_financial_access && styles.switchThumbActive]} />
                  </View>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.toggleRow, editingProtectedAdmin && styles.toggleRowDisabled]}
                disabled={editingProtectedAdmin}
                onPress={() => setUForm((form) => ({ ...form, is_active: !form.is_active }))}>
                <View style={[styles.toggleIcon, uForm.is_active && styles.toggleIconActive]}>
                  {uForm.is_active ? (
                    <CheckCircle2 size={15} color={Colors.success} />
                  ) : (
                    <XCircle size={15} color={Colors.textMuted} />
                  )}
                </View>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleTitle}>Cont activ</Text>
                  <Text style={styles.toggleSubtitle}>Contul se poate autentifica in aplicatie.</Text>
                </View>
                <View style={[styles.switchTrack, uForm.is_active && styles.switchTrackActive]}>
                  <View style={[styles.switchThumb, uForm.is_active && styles.switchThumbActive]} />
                </View>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setUserModal(false)}>
                  <Text style={styles.modalCancelText}>Anuleaza</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={saveUser} disabled={uLoading}>
                  {uLoading ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.modalSaveText}>Salveaza</Text>
                  )}
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          </SwipeDownSheet>
        </KeyboardAvoidingView>
      </Modal>

      <LogoutConfirmModal
        visible={logoutPromptVisible}
        loading={logoutLoading}
        userName={user?.display_name || user?.username}
        onCancel={closeLogoutPrompt}
        onConfirm={confirmLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 14, paddingBottom: 60 },
  logoutBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  aboutCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  aboutLogo: { width: 74, height: 74, borderRadius: 30, marginBottom: 10 },
  aboutSub: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter-Regular', marginBottom: 4 },
  aboutUser: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-SemiBold', marginBottom: 4 },
  aboutVersion: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular' },
  mobileUpdateCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 12,
  },
  mobileUpdateCardAvailable: {
    borderColor: Colors.orange + '66',
    backgroundColor: Colors.orangeDim,
  },
  mobileUpdateHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mobileUpdateIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.orangeDim,
    borderWidth: 1,
    borderColor: Colors.orange + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileUpdateCopy: { flex: 1, minWidth: 0 },
  mobileUpdateTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold' },
  mobileUpdateSub: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  mobileUpdateBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  mobileUpdateBadgeHot: {
    backgroundColor: Colors.successDim,
    borderColor: Colors.success + '44',
  },
  mobileUpdateBadgeError: {
    backgroundColor: Colors.errorDim,
    borderColor: Colors.error + '44',
  },
  mobileUpdateBadgeText: { color: Colors.textSecondary, fontSize: 10, fontFamily: 'Inter-Bold' },
  mobileUpdateBadgeTextHot: { color: Colors.success },
  mobileUpdateBadgeTextError: { color: Colors.error },
  mobileUpdateMessage: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  mobileUpdateVersionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  mobileUpdateVersionLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Medium', textTransform: 'uppercase' },
  mobileUpdateVersionValue: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Bold' },
  mobileUpdateVersionNew: { color: Colors.orange },
  mobileUpdateArrow: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter-Regular' },
  mobileUpdateActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  mobileUpdateGhostBtn: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.orange + '55',
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  mobileUpdateGhostText: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  mobileUpdatePrimaryBtn: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: Colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  mobileUpdatePrimaryText: { color: Colors.white, fontSize: 12, fontFamily: 'Inter-Bold' },
  actionBtnDisabled: { opacity: 0.58 },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.orangeDim,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.orange + '33',
  },
  infoText: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Regular', flex: 1, lineHeight: 18 },
  companyStatusText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 10,
    lineHeight: 18,
  },
  companyGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  companyGridItem: {
    flex: 1,
    minWidth: 0,
  },
  companyInput: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 10,
  },
  companyInputInIcon: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  companyTextArea: {
    minHeight: 82,
    textAlignVertical: 'top',
    paddingTop: 12,
    flex: 1,
    marginBottom: 0,
  },
  companyInputIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  stampCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    marginBottom: 12,
  },
  stampPreview: {
    width: '100%',
    height: 110,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10,
  },
  stampEmpty: {
    height: 110,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  stampEmptyText: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular' },
  stampActions: { flexDirection: 'row', gap: 10 },
  stampBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.orange + '55',
    backgroundColor: Colors.orangeDim,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  stampBtnText: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-Bold' },
  stampBtnDanger: {
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.error + '55',
    backgroundColor: Colors.error + '14',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
  },
  stampBtnDangerText: { color: Colors.error, fontSize: 12, fontFamily: 'Inter-Bold' },
  companySaveBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  companySaveText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-Bold' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-SemiBold', flex: 1 },
  sectionCount: {
    backgroundColor: Colors.orangeDim,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionCountText: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-Bold' },

  sectionContent: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingVertical: 12,
  },

  itemCard: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderLeftWidth: 3,
  },
  itemMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  colorCircle: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  itemInfo: { flex: 1 },
  itemName: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-SemiBold' },
  itemRole: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular' },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pctText: { fontSize: 13, fontFamily: 'Inter-Bold' },
  contactDetails: {
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  contactDetail: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  contactDetailText: { flex: 1, color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-Medium' },
  addedAtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingTop: 1,
  },
  addedAtText: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Medium' },

  userSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  userSummaryTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 64,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 3,
  },
  userSummaryValue: { color: Colors.textPrimary, fontSize: 18, fontFamily: 'Inter-Bold' },
  userSummaryLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-SemiBold', textTransform: 'uppercase' },
  userCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  userCardPinned: {
    borderColor: Colors.orange + '66',
    backgroundColor: Colors.orangeDim,
  },
  userCardInactive: { opacity: 0.68 },
  userCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarAgent: {
    backgroundColor: Colors.orange,
    borderColor: Colors.orangeLight,
  },
  userAvatarText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter-Bold' },
  userCardMain: { flex: 1, minWidth: 0 },
  userTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { flex: 1, color: Colors.textPrimary, fontSize: 15, fontFamily: 'Inter-Bold' },
  userUsername: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: Colors.successDim,
    borderColor: Colors.success + '44',
  },
  statusPillInactive: {
    backgroundColor: Colors.errorDim,
    borderColor: Colors.error + '44',
  },
  statusPillText: { fontSize: 10, fontFamily: 'Inter-Bold' },
  statusTextActive: { color: Colors.success },
  statusTextInactive: { color: Colors.error },
  userChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 10,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  userChipSupport: {
    backgroundColor: Colors.successDim,
    borderColor: Colors.success + '33',
  },
  userChipText: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-SemiBold' },
  userChipTextSuccess: { color: Colors.success },

  earningsPreview: { marginBottom: 10 },
  progressBar: {
    height: 5,
    backgroundColor: Colors.cardBorder,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 10, fontFamily: 'Inter-Regular', color: Colors.textMuted },

  itemActions: { flexDirection: 'row', gap: 8 },
  expenseItemActions: { justifyContent: 'center' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.orangeDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.orange + '44',
  },
  actionText: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-Medium' },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.errorDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.error + '44',
  },
  actionTextDanger: { color: Colors.error, fontSize: 12, fontFamily: 'Inter-Medium' },

  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.orange,
    borderRadius: 10,
    paddingVertical: 10,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addItemText: { color: Colors.orange, fontSize: 13, fontFamily: 'Inter-SemiBold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: '92%',
    borderTopWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalContent: { paddingBottom: 12 },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.cardBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold', marginBottom: 16 },
  modalLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    marginBottom: 5,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInput: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalHelper: {
    marginTop: 6,
    color: Colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: 'Inter-Regular',
  },
  inputDisabled: {
    opacity: 0.65,
    backgroundColor: Colors.surface,
  },
  contactInputWrap: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  contactInput: {
    flex: 1,
    paddingVertical: 11,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  protectedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: Colors.orangeDim,
    borderRadius: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: Colors.orange + '33',
    marginBottom: 8,
  },
  protectedNoticeText: { flex: 1, color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 17 },
  segmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  segmentOption: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 42,
    borderRadius: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  segmentOptionActive: {
    backgroundColor: Colors.orangeDim,
    borderColor: Colors.orange,
  },
  segmentOptionDisabled: {
    opacity: 0.48,
  },
  segmentText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  segmentTextActive: { color: Colors.orange },
  toggleRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginTop: 10,
  },
  toggleRowDisabled: { opacity: 0.6 },
  toggleIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIconActive: {
    backgroundColor: Colors.successDim,
    borderColor: Colors.success + '44',
  },
  toggleCopy: { flex: 1, minWidth: 0 },
  toggleTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  toggleSubtitle: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', lineHeight: 16, marginTop: 2 },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 2,
  },
  switchTrackActive: {
    backgroundColor: Colors.successDim,
    borderColor: Colors.success + '55',
  },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.textMuted,
  },
  switchThumbActive: {
    backgroundColor: Colors.success,
    transform: [{ translateX: 20 }],
  },
  modalError: {
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
  },
  pctPreview: { marginTop: 8 },
  pctPreviewBar: {
    height: 6,
    backgroundColor: Colors.cardBorder,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  pctPreviewFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.orange },
  pctPreviewLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  pctPreviewLabelAgent: { color: Colors.orange, fontSize: 11, fontFamily: 'Inter-Medium' },
  pctPreviewLabelGt: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular' },
  colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: { borderColor: Colors.white, transform: [{ scale: 1.2 }] },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalCancelText: { color: Colors.textSecondary, fontSize: 15, fontFamily: 'Inter-Medium' },
  modalSave: {
    flex: 1,
    backgroundColor: Colors.orange,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalSaveText: { color: Colors.white, fontSize: 15, fontFamily: 'Inter-SemiBold' },
});
