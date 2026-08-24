import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  Server,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import {
  bootstrapSystemAt,
  getRuntimeApiConfig,
  getSystemDatabaseInfo,
  normalizeApiUrl,
  saveRuntimeApiConfig,
  saveSystemDatabaseInfo,
} from '@/services/api';

type Props = {
  token: string;
  onSystemChanged: () => Promise<void>;
};

type FormState = {
  apiUrl: string;
  apiKey: string;
  dbHost: string;
  dbName: string;
  dbUser: string;
  dbPass: string;
  serviceSheetPdfBaseUrl: string;
};

const emptyForm: FormState = {
  apiUrl: '',
  apiKey: '',
  dbHost: '',
  dbName: '',
  dbUser: '',
  dbPass: '',
  serviceSheetPdfBaseUrl: 'https://g-trots.ro/fs/',
};

function normalizeServiceSheetPdfBaseUrl(value: string) {
  let normalized = String(value || '').trim();
  if (!normalized) normalized = 'https://g-trots.ro/fs/';
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized.replace(/^\/+/, '')}`;
  return normalized.replace(/[?#].*$/, '').replace(/\/+$/, '') + '/';
}

export default function SystemDatabaseSettings({ token, onSystemChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [runSchema, setRunSchema] = useState(true);
  const [status, setStatus] = useState('Configuratie separata pentru acest telefon.');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');

  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const load = async () => {
    if (!token || loading) return;
    setLoading(true);
    setStatusType('info');
    setStatus('Se citesc configuratia telefonului si datele serverului...');
    try {
      const runtime = await getRuntimeApiConfig();
      setForm((current) => ({
        ...current,
        apiUrl: runtime.apiUrl,
        apiKey: runtime.apiKey,
      }));
      const info = await getSystemDatabaseInfo(token);
      setForm({
        apiUrl: runtime.apiUrl || info.api_url || '',
        apiKey: runtime.apiKey || info.api_key || '',
        dbHost: info.db_host || '',
        dbName: info.db_name || '',
        dbUser: info.db_user || '',
        dbPass: info.db_pass || '',
        serviceSheetPdfBaseUrl:
          info.service_sheet_pdf_base_url || 'https://g-trots.ro/fs/',
      });
      setStatusType('success');
      setStatus(
        `${info.schema_file ? 'schema.sql disponibil' : 'schema.sql lipseste'} · ` +
        `${info.config_file_saved ? 'configuratie server activa' : 'configuratie implicita'}`
      );
    } catch (error: any) {
      setStatusType('error');
      setStatus(error?.message || 'Configuratia serverului nu a putut fi citita.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !form.apiUrl) void load();
  };

  const save = async () => {
    if (saving) return;
    const apiUrl = normalizeApiUrl(form.apiUrl);
    const apiKey = form.apiKey.trim();
    const dbHost = form.dbHost.trim();
    const dbName = form.dbName.trim();
    const dbUser = form.dbUser.trim();
    const dbPass = form.dbPass;
    const serviceSheetPdfBaseUrl = normalizeServiceSheetPdfBaseUrl(
      form.serviceSheetPdfBaseUrl
    );

    if (!apiUrl || !apiKey || !dbHost || !dbName || !dbUser || !serviceSheetPdfBaseUrl) {
      Alert.alert(
        'Date lipsa',
        'Completeaza API URL, API Key, DB Host, DB Name, DB User si adresa fiselor de service.'
      );
      return;
    }

    setSaving(true);
    setStatusType('info');
    setStatus('Se testeaza serverul si se pregateste baza de date...');
    try {
      const current = await getRuntimeApiConfig();
      const changingServer = normalizeApiUrl(current.apiUrl) !== apiUrl;
      if (changingServer && !dbPass) {
        throw new Error('Parola MySQL este obligatorie cand conectezi un server nou.');
      }

      const payload = {
        api_key: apiKey,
        db_host: dbHost,
        db_name: dbName,
        db_user: dbUser,
        db_pass: dbPass,
        service_sheet_pdf_base_url: serviceSheetPdfBaseUrl,
        keep_db_pass: !dbPass ? 1 : 0,
        run_schema: changingServer ? 1 : (runSchema ? 1 : 0),
      };
      const result = changingServer
        ? await bootstrapSystemAt({ apiUrl, apiKey }, payload)
        : await saveSystemDatabaseInfo(token, payload);

      await saveRuntimeApiConfig({ apiUrl, apiKey });
      const databaseLabel = result.database_created
        ? `Baza ${dbName} a fost creata.`
        : `Baza ${dbName} exista deja.`;
      setStatusType('success');
      setStatus(`${databaseLabel} Configuratia acestui telefon a fost salvata.`);

      Alert.alert(
        'Sistem conectat',
        result.default_admin_ready
          ? 'Telefonul va folosi noul sistem. Autentifica-te cu admin / admin.'
          : 'Telefonul va folosi noul sistem. Autentifica-te cu parola curenta a contului admin.',
        [{ text: 'Continua', onPress: () => void onSystemChanged() }]
      );
    } catch (error: any) {
      const message = error?.message || 'Configuratia nu a putut fi salvata.';
      setStatusType('error');
      setStatus(message);
      Alert.alert('Eroare sistem', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.sectionHeader} onPress={toggle} activeOpacity={0.8}>
        <Database size={17} color={Colors.orange} />
        <View style={styles.headerCopy}>
          <Text style={styles.sectionTitle}>System Database Information</Text>
          <Text style={styles.sectionSubtitle}>API & MySQL pentru acest telefon</Text>
        </View>
        {expanded ? (
          <ChevronUp size={17} color={Colors.textMuted} />
        ) : (
          <ChevronDown size={17} color={Colors.textMuted} />
        )}
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.content}>
          <View style={styles.notice}>
            <Server size={16} color={Colors.orange} />
            <Text style={styles.noticeText}>
              Schimbarea se aplica numai acestui telefon. Desktopul si celelalte telefoane isi
              pastreaza configuratia pana cand le conectezi manual la acelasi API.
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.orange} style={styles.loader} />
          ) : (
            <>
              <Field
                label="API URL"
                value={form.apiUrl}
                placeholder="https://client.ro/trotty-api"
                onChangeText={(value) => update('apiUrl', value)}
              />
              <Field
                label="API Key"
                value={form.apiKey}
                placeholder="API Key"
                onChangeText={(value) => update('apiKey', value)}
              />
              <Field
                label="Adresa fise service salvate"
                value={form.serviceSheetPdfBaseUrl}
                placeholder="https://g-trots.ro/fs/"
                onChangeText={(value) => update('serviceSheetPdfBaseUrl', value)}
              />
              <Field
                label="DB Host"
                value={form.dbHost}
                placeholder="localhost"
                onChangeText={(value) => update('dbHost', value)}
              />
              <Field
                label="DB Name"
                value={form.dbName}
                placeholder="gtrots_client"
                onChangeText={(value) => update('dbName', value)}
              />
              <Field
                label="DB User"
                value={form.dbUser}
                placeholder="mysql_user"
                onChangeText={(value) => update('dbUser', value)}
              />

              <Text style={styles.label}>DB Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={form.dbPass}
                  onChangeText={(value) => update('dbPass', value)}
                  placeholder="Parola MySQL"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.passwordInput}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((visible) => !visible)}>
                  {showPassword ? (
                    <EyeOff size={18} color={Colors.textSecondary} />
                  ) : (
                    <Eye size={18} color={Colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setRunSchema((value) => !value)}>
                <View style={[styles.check, runSchema && styles.checkActive]}>
                  {runSchema ? <CheckCircle2 size={16} color={Colors.success} /> : null}
                </View>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleTitle}>Ruleaza schema.sql automat</Text>
                  <Text style={styles.toggleSubtitle}>
                    Creeaza tabelele si contul implicit admin / admin.
                  </Text>
                </View>
              </TouchableOpacity>

              <View
                style={[
                  styles.status,
                  statusType === 'success' && styles.statusSuccess,
                  statusType === 'error' && styles.statusError,
                ]}>
                <Text
                  selectable
                  style={[
                    styles.statusText,
                    statusType === 'success' && styles.statusTextSuccess,
                    statusType === 'error' && styles.statusTextError,
                  ]}>
                  {status}
                </Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={load} disabled={loading || saving}>
                  <RefreshCw size={16} color={Colors.textSecondary} />
                  <Text style={styles.secondaryButtonText}>Reincarca</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={save} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <>
                      <Save size={16} color={Colors.white} />
                      <Text style={styles.primaryButtonText}>Salveaza sistem</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ) : null}
    </>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  headerCopy: { flex: 1, gap: 2 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-SemiBold' },
  sectionSubtitle: { color: Colors.textMuted, fontSize: 10, fontFamily: 'Inter-Regular' },
  content: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: Colors.orangeDim,
    borderRadius: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: Colors.orangeMid,
    marginBottom: 12,
  },
  noticeText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter-Regular',
  },
  loader: { paddingVertical: 30 },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    marginTop: 10,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 46,
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 13,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  passwordWrap: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  eyeButton: { width: 46, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 11,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  check: {
    width: 23,
    height: 23,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  checkActive: { backgroundColor: Colors.successDim, borderColor: Colors.success + '55' },
  toggleCopy: { flex: 1 },
  toggleTitle: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  toggleSubtitle: {
    color: Colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  status: {
    backgroundColor: Colors.card,
    borderRadius: 9,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  statusSuccess: { backgroundColor: Colors.successDim, borderColor: Colors.success + '44' },
  statusError: { backgroundColor: Colors.errorDim, borderColor: Colors.error + '44' },
  statusText: { color: Colors.textSecondary, fontSize: 11, lineHeight: 16, fontFamily: 'Inter-Regular' },
  statusTextSuccess: { color: Colors.success },
  statusTextError: { color: Colors.error },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  secondaryButtonText: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-SemiBold' },
  primaryButton: {
    flex: 1.35,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: Colors.orange,
  },
  primaryButtonText: { color: Colors.white, fontSize: 12, fontFamily: 'Inter-SemiBold' },
});
