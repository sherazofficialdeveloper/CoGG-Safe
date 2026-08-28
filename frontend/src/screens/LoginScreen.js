// LoginScreen.js

import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import {typography} from '../theme';

const LoginScreen = ({onLogin}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('user');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setError('Enter your username or email to continue.');
      return;
    }

    if (trimmedIdentifier.length > 254) {
      setError('Username or email is too long.');
      return;
    }

    if (!password) {
      setError('Enter your password to continue.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      await onLogin(trimmedIdentifier, password, selectedRole);
    } catch (loginError) {
      const message =
        loginError?.status === 403 && /inactive/i.test(loginError.message || '')
          ? 'Your account is currently inactive. Please contact your administrator.'
          : loginError?.status === 403 && /mode|authorized/i.test(loginError.message || '')
            ? 'These credentials are not valid for the selected sign-in mode.'
            : 'Invalid username or password.';
      setError(
        loginError?.status === 0
          ? 'Unable to connect. Please check your internet connection and try again.'
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          <View style={styles.container}>

            {/* Logo Section */}
            <View style={styles.logoSection}>
              <View style={styles.logoWrapper}>
                <Image
                  source={require('../public/logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              <Text style={styles.appName}>CoGG Safe</Text>

              <Text style={styles.tagline}>
                Because we do care...
              </Text>
            </View>

            {/* Login Form */}
            <View style={styles.formSection}>

              {/* User / Admin Toggle */}
              <View style={styles.toggleContainer}>

                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    selectedRole === 'user' &&
                      styles.toggleButtonActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setSelectedRole('user')}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityState={{selected: selectedRole === 'user'}}>

                  <Text
                    style={[
                      styles.toggleText,
                      selectedRole === 'user' &&
                        styles.toggleTextActive,
                    ]}>
                    User
                  </Text>

                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    selectedRole === 'admin' &&
                      styles.toggleButtonAdminActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setSelectedRole('admin')}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityState={{selected: selectedRole === 'admin'}}>

                  <Text
                    style={[
                      styles.toggleText,
                      selectedRole === 'admin' &&
                        styles.toggleTextActive,
                    ]}>
                    Admin
                  </Text>

                </TouchableOpacity>

              </View>

              {/* Username Label */}
              <Text style={styles.label}>
                {selectedRole === 'admin'
                  ? 'ADMIN USERNAME'
                  : 'USERNAME'}
              </Text>

              {/* Username Input */}
              <TextInput
                style={styles.input}
                placeholder={
                  selectedRole === 'admin'
                    ? 'e.g. admin123'
                    : 'e.g. user123'
                }
                placeholderTextColor="#9CA3AF"
                value={identifier}
                onChangeText={setIdentifier}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Password Label */}
              <Text style={styles.label}>PASSWORD</Text>

              {/* Password Input */}
              <View style={styles.passwordInputWrapper}>

                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() =>
                    setPasswordVisible(visible => !visible)
                  }
                  style={styles.passwordToggle}
                  accessibilityLabel={
                    passwordVisible
                      ? 'Hide password'
                      : 'Show password'
                  }>

                  <Text style={styles.passwordToggleText}>
                    <Icon name={passwordVisible ? 'eyeOff' : 'eye'} size={20} color="#6B7280" />
                  </Text>

                </TouchableOpacity>

              </View>

              {/* Login Button */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.loginButton,
                  selectedRole === 'admin' &&
                    styles.loginButtonAdmin,
                  submitting &&
                    styles.loginButtonDisabled,
                ]}
                onPress={handleLogin}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityState={{disabled: submitting}}>

                <Text style={styles.loginButtonText}>
                  {submitting ? 'Signing in...' : 'Log In'}
                </Text>

              </TouchableOpacity>

              {/* Error */}
              {error ? (
                <Text style={styles.errorText}>
                  {error}
                </Text>
              ) : null}

              {/* Footer */}
              <Text style={styles.footerText}>
                Trouble signing in? Contact your safety admin
              </Text>

            </View>

          </View>

        </ScrollView>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  keyboardContainer: {
    flex: 1,
  },

  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 30,
    justifyContent: 'center',
  },

  /* ================= LOGO ================= */

  logoSection: {
    alignItems: 'center',
    marginBottom: 34,
  },

  logoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FDE5E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',

    shadowColor: '#E4002B',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },

  logo: {
    width: 78,
    height: 78,
  },

  appName: {
    fontFamily: typography.fontFamily,
    fontSize: 30,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 0.5,
  },

  tagline: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: '#6B7280',
    marginTop: 5,
    fontWeight: '600',
  },

  /* ================= FORM ================= */

  formSection: {
    width: '100%',
  },

  /* ================= ROLE TOGGLE ================= */

  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 30,
    padding: 5,
    marginBottom: 22,
  },

  toggleButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  toggleButtonActive: {
    backgroundColor: '#E4002B',

    shadowColor: '#E4002B',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },

  toggleButtonAdminActive: {
    backgroundColor: '#1A1A1A',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },

  toggleText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '800',
    color: '#6B7280',
  },

  toggleTextActive: {
    color: '#FFFFFF',
  },

  /* ================= LABEL ================= */

  label: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '900',
    color: '#374151',
    marginBottom: 8,
    letterSpacing: 1,
  },

  /* ================= NORMAL INPUT ================= */

  input: {
    fontFamily: typography.fontFamily,
    width: '100%',
    height: 54,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 27,
    paddingHorizontal: 20,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 18,
  },

  /* ================= PASSWORD INPUT ================= */

  passwordInputWrapper: {
    width: '100%',
    height: 54,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },

  passwordInput: {
    fontFamily: typography.fontFamily,
    flex: 1,
    height: '100%',
    paddingLeft: 20,
    paddingRight: 60,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },

  passwordToggle: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },

  passwordToggleText: {
    fontSize: 21,
  },

  /* ================= LOGIN BUTTON ================= */

  loginButton: {
    height: 56,
    backgroundColor: '#E4002B',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 14,

    shadowColor: '#E4002B',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },

  loginButtonAdmin: {
    backgroundColor: '#1A1A1A',

    shadowColor: '#000',
  },

  loginButtonDisabled: {
    opacity: 0.65,
  },

  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  /* ================= ERROR ================= */

  errorText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
    paddingHorizontal: 10,
  },

  /* ================= FOOTER ================= */

  footerText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: 12,
  },

});

export default LoginScreen;