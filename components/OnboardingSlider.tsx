import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  type ListRenderItem,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Slide = {
  icon: IconName;
  title: string;
  subtitle: string;
  color: string;
};

const SLIDES: Slide[] = [
  {
    icon: 'people-circle-outline',
    title: 'Welcome to Quorum',
    subtitle: 'The app that turns group indecision into confirmed plans.',
    color: Colors.primary,
  },
  {
    icon: 'thumbs-up-outline',
    title: 'Vote to Confirm',
    subtitle: "Plans are confirmed once enough people vote. No more 'I'm down if everyone else is.'",
    color: Colors.text,
  },
  {
    icon: 'calendar-outline',
    title: 'Invite & Discover',
    subtitle: 'Invite friends, join public events, and connect with your social circle.',
    color: Colors.text,
  },
  {
    icon: 'rocket-outline',
    title: "Let's Go!",
    subtitle: 'Create your first plan and start making things happen together.',
    color: Colors.primary,
  },
];

const VIEWABILITY_CONFIG = { viewAreaCoveragePercentThreshold: 50 };

type Props = { visible: boolean; onDone: () => void };

const SlideItem = React.memo(function SlideItem({ slide }: { slide: Slide }) {
  return (
    <View style={styles.slide}>
      <Ionicons name={slide.icon} size={48} color={slide.color} style={styles.slideIcon} />
      <Text style={[styles.title, { color: slide.color }]}>{slide.title}</Text>
      <Text style={styles.subtitle}>{slide.subtitle}</Text>
    </View>
  );
});

export default function OnboardingSlider({ visible, onDone }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);

  const handleDone = useCallback(() => {
    onDone();
    setCurrentIndex(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [onDone]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = Math.min(prev + 1, SLIDES.length - 1);
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      return next;
    });
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const index = viewableItems[0]?.index;
      if (typeof index === 'number') {
        setCurrentIndex(index);
      }
    }
  ).current;

  const getItemLayout = useCallback(
    (_: ArrayLike<Slide> | null | undefined, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    }),
    []
  );

  const renderItem = useCallback<ListRenderItem<Slide>>(
    ({ item }) => <SlideItem slide={item} />,
    []
  );

  const isLast = currentIndex === SLIDES.length - 1;
  const handlePrimary = isLast ? handleDone : handleNext;

  const dots = useMemo(
    () =>
      SLIDES.map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === currentIndex ? styles.dotActive : styles.dotInactive]}
        />
      )),
    [currentIndex]
  );

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={handleDone}>
      <View style={styles.container}>
        <View style={styles.skipRow}>
          {!isLast && (
            <TouchableOpacity
              onPress={handleDone}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          ref={flatListRef}
          data={SLIDES}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          getItemLayout={getItemLayout}
          scrollEventThrottle={16}
          renderItem={renderItem}
        />

        <View style={styles.bottom}>
          <View style={styles.dotsRow}>{dots}</View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handlePrimary}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Get started' : 'Next slide'}
          >
            <Text style={styles.primaryButtonText}>{isLast ? 'Get Started' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipRow: {
    height: 52,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  skipButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  skipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  slideIcon: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottom: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 48,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: Radius.full,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 24,
  },
  dotInactive: {
    backgroundColor: Colors.borderStrong,
    width: 8,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.background,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
});
