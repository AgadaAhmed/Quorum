import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { captureException } from '../lib/sentry';
import { supportMailto } from '../lib/support';

// Top-level error boundary. Catches render-time crashes anywhere in the tree,
// reports them (Sentry, if configured), and shows a friendly recovery screen
// instead of a blank/white screen. Colors are hardcoded to the Quorum brand
// (not from the theme) on purpose: if the ThemeProvider itself is what threw,
// the fallback must still render.
const INK = '#080608';
const LIGHT = '#ffffff';
const MUTED = '#9ca3af';
const BORDER = '#2a2a2e';

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, { componentStack: info.componentStack });
  }

  handleReset = () => this.setState({ hasError: false });

  handleContact = () => {
    Linking.openURL(supportMailto('Quorum — App crashed')).catch(() => {});
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. You can try again, or contact support if it keeps
          happening.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={this.handleReset}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.primaryBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={this.handleContact}
          accessibilityRole="button"
          accessibilityLabel="Contact support"
        >
          <Text style={styles.ghostBtnText}>Contact Support</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    color: LIGHT,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  body: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: LIGHT,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: INK,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: LIGHT,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
