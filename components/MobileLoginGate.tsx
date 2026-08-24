import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeInDown, FadeInUp, LinearTransition } from 'react-native-reanimated';
import { LockKeyhole, User } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import AppAuroraBackground from '@/components/AppAuroraBackground';

const appLogo = require('../assets/images/logo.png');

export default function MobileLoginGate({ children }: { children: React.ReactNode }) {
  const {
    user,
    login,
    loading,
    initializing,
    rememberedUsername,
    rememberedLogin,
  } = useAuth();
  const passwordRef = useRef<TextInput | null>(null);
  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(rememberedLogin);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!username && rememberedUsername) setUsername(rememberedUsername);
  }, [rememberedUsername, username]);

  React.useEffect(() => {
    setRememberMe(rememberedLogin);
  }, [rememberedLogin]);

  if (initializing) {
    return (
      <AppAuroraBackground>
        <View style={styles.initialLoader}>
          <ActivityIndicator size="large" color={Colors.orange} />
          <Text style={styles.initialLoaderText}>Se restaureaza sesiunea...</Text>
        </View>
      </AppAuroraBackground>
    );
  }

  if (user) return <AppAuroraBackground>{children}</AppAuroraBackground>;

  const submit = async () => {
    if (!username.trim() || !password.trim() || loading) return;
    try {
      setError('');
      await login(username, password, rememberMe);
      setPassword('');
    } catch (e: any) {
      setError(e.message || 'Autentificare esuata.');
    }
  };

  return (
    <AppAuroraBackground>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}>
            <Animated.View
              entering={FadeInDown.duration(520).delay(90).springify().damping(18).stiffness(130)}
              layout={LinearTransition.springify().damping(18).stiffness(120)}
              style={styles.card}>
              <Animated.View entering={FadeInUp.duration(420).delay(180)} style={styles.brand}>
                <Image source={appLogo} style={styles.mark} />
                <Text style={styles.title}>G-Trots</Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(420).delay(250)} style={styles.field}>
                <Text style={styles.label}>User</Text>
                <View style={styles.inputWrap}>
                  <User size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="mobile1"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(420).delay(310)} style={styles.field}>
                <Text style={styles.label}>Parola</Text>
                <View style={styles.inputWrap}>
                  <LockKeyhole size={18} color={Colors.textMuted} />
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="parola"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={submit}
                  />
                </View>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(420).delay(340)} style={styles.rememberRow}>
                <TouchableOpacity
                  style={styles.rememberCopy}
                  activeOpacity={0.8}
                  onPress={() => setRememberMe((current) => !current)}>
                  <Text style={styles.rememberTitle}>Tine-ma minte</Text>
                  <Text style={styles.rememberSubtitle}>Pastreaza sesiunea securizat pe acest telefon</Text>
                </TouchableOpacity>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ false: '#383532', true: '#8F3F08' }}
                  thumbColor={rememberMe ? Colors.orange : '#B5AEA8'}
                  ios_backgroundColor="#383532"
                />
              </Animated.View>

              {error ? (
                <Animated.Text entering={FadeIn.duration(180)} style={styles.error} selectable>
                  {error}
                </Animated.Text>
              ) : null}

              <Animated.View entering={FadeInUp.duration(420).delay(370)}>
                <TouchableOpacity
                  style={[styles.button, (!username.trim() || !password.trim() || loading) && styles.buttonDisabled]}
                  onPress={submit}
                  disabled={!username.trim() || !password.trim() || loading}>
                  {loading ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.buttonText}>Intra in aplicatie</Text>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </AppAuroraBackground>
  );
}

const styles = StyleSheet.create({
  initialLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  initialLoaderText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  keyboard: {
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
    paddingTop: 56,
    paddingBottom: 56,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 30,
    padding: 24,
    boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 20,
  },
  mark: {
    width: 70,
    height: 70,
    borderRadius: 26,
    marginBottom: 14,
  },
  title: {
    color: '#F7F3EF',
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  field: { marginBottom: 14 },
  label: {
    color: '#A7A09A',
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    marginBottom: 7,
    letterSpacing: 0.8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(10,10,10,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 48,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  error: {
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    borderRadius: 14,
    padding: 12,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 14,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 1,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  rememberCopy: {
    flex: 1,
  },
  rememberTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  rememberSubtitle: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  button: {
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 16px 32px rgba(255,107,0,0.28)',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: Colors.white, fontSize: 15, fontFamily: 'Inter-Bold' },
});
