import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { type ThemePalette } from '../lib/theme';
import { useThemedStyles } from '../lib/ThemeContext';

const DEFAULT_EDGES: readonly Edge[] = ['top', 'left', 'right'];

interface Props {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  edges?: readonly Edge[];
}

function ScreenWrapper({ children, style, edges = DEFAULT_EDGES }: Props) {
  const styles = useThemedStyles(makeStyles);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const fillStyle = useMemo(() => [styles.fill, { opacity }], [opacity]);

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      <Animated.View style={fillStyle}>{children}</Animated.View>
    </SafeAreaView>
  );
}

export default React.memo(ScreenWrapper);

const makeStyles = (Colors: ThemePalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
});
