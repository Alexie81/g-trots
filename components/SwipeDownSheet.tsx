import React, { useEffect, useMemo } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/colors';

type Props = {
  children: React.ReactNode;
  visible: boolean;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export default function SwipeDownSheet({
  children,
  visible,
  onClose,
  style,
  disabled = false,
}: Props) {
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [translateY, visible]);

  const close = () => {
    if (!disabled) onClose();
  };

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: (_event, gestureState) =>
        !disabled
        && Math.abs(gestureState.dy) > 3
        && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderGrant: () => {
        startY.value = translateY.value;
      },
      onPanResponderMove: (_event, gestureState) => {
        translateY.value = Math.max(0, startY.value + gestureState.dy);
      },
      onPanResponderRelease: (_event, gestureState) => {
        const currentY = Math.max(0, startY.value + gestureState.dy);
        if (gestureState.vy > 0.65 || currentY > 70) {
          translateY.value = withTiming(height, { duration: 210 }, (finished) => {
            if (finished) runOnJS(close)();
          });
          return;
        }
        translateY.value = withSpring(0, {
          damping: 22,
          stiffness: 230,
          mass: 0.85,
        });
      },
      onPanResponderTerminate: () => {
        translateY.value = withSpring(0, {
          damping: 22,
          stiffness: 230,
          mass: 0.85,
        });
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
    [disabled, height, startY, translateY]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      <View style={styles.handleHitArea} {...panResponder.panHandlers}>
        <View style={styles.handle} />
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  handleHitArea: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: Colors.textMuted,
    opacity: 0.62,
  },
});
