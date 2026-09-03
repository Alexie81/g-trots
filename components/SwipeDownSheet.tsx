import React, { forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
  header?: React.ReactNode;
  visible: boolean;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export type SwipeDownSheetHandle = {
  dismiss: () => void;
};

const SwipeDownSheet = forwardRef<SwipeDownSheetHandle, Props>(function SwipeDownSheet({
  children,
  header,
  visible,
  onClose,
  style,
  disabled = false,
}, ref) {
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    translateY.value = height;
    translateY.value = withTiming(0, { duration: 280 });
  }, [height, translateY, visible]);

  const finishClose = useCallback(() => {
    if (!disabled) onClose();
  }, [disabled, onClose]);

  const dismiss = useCallback(() => {
    if (disabled) return;
    translateY.value = withTiming(height, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [disabled, finishClose, height, translateY]);

  useImperativeHandle(ref, () => ({ dismiss }), [dismiss]);

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetY(4)
    .failOffsetX([-24, 24])
    .onBegin(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateY.value = Math.max(0, startY.value + event.translationY);
    })
    .onEnd((event) => {
      const currentY = Math.max(0, startY.value + event.translationY);
      if (event.velocityY > 650 || currentY > 70) {
        translateY.value = withTiming(height, { duration: 210 }, (finished) => {
          if (finished) runOnJS(finishClose)();
        });
        return;
      }
      translateY.value = withSpring(0, {
        damping: 22,
        stiffness: 230,
        mass: 0.85,
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      <GestureDetector gesture={panGesture}>
        {header ? <View style={styles.headerDragArea}>
          <View style={styles.headerHandleHitArea}><View style={styles.handle} /></View>
          {header}
        </View> : <View style={styles.handleHitArea}><View style={styles.handle} /></View>}
      </GestureDetector>
      {children}
    </Animated.View>
  );
});

export default SwipeDownSheet;

const styles = StyleSheet.create({
  handleHitArea: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  headerDragArea: {
    width: '100%',
  },
  headerHandleHitArea: {
    minHeight: 25,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 5,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: Colors.textMuted,
    opacity: 0.62,
  },
});
