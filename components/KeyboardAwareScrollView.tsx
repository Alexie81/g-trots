import React, { useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  type ScrollViewProps,
  TextInput,
  useWindowDimensions,
} from 'react-native';

type Props = ScrollViewProps & {
  extraScrollHeight?: number;
};

export default function KeyboardAwareScrollView({
  extraScrollHeight = 110,
  keyboardShouldPersistTaps = 'handled',
  keyboardDismissMode = 'on-drag',
  contentInsetAdjustmentBehavior = 'automatic',
  onScroll,
  scrollEventThrottle = 16,
  ...props
}: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const keyboardVisibleRef = useRef(false);
  const keyboardTopRef = useRef(windowHeight);
  const scrollYRef = useRef(0);
  const lastFocusedRef = useRef<unknown>(null);

  const revealFocusedInput = useCallback((force = false) => {
    const focusedInput = (TextInput.State as any).currentlyFocusedInput?.();
    if (!focusedInput || (!force && focusedInput === lastFocusedRef.current)) return;
    lastFocusedRef.current = focusedInput;
    requestAnimationFrame(() => {
      if (typeof focusedInput.measureInWindow === 'function') {
        focusedInput.measureInWindow((_x: number, y: number, _width: number, height: number) => {
          const visibleBottom = keyboardTopRef.current - extraScrollHeight;
          const hiddenBy = y + height - visibleBottom;
          if (hiddenBy > 0) {
            scrollRef.current?.scrollTo({
              y: Math.max(0, scrollYRef.current + hiddenBy),
              animated: true,
            });
          }
        });
        return;
      }
      (scrollRef.current as any)?.scrollResponderScrollNativeHandleToKeyboard?.(
        focusedInput,
        extraScrollHeight,
        true
      );
    });
  }, [extraScrollHeight]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      keyboardVisibleRef.current = true;
      keyboardTopRef.current =
        event.endCoordinates?.screenY
        || windowHeight - (event.endCoordinates?.height || 0);
      setTimeout(() => revealFocusedInput(true), Platform.OS === 'ios' ? 80 : 140);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardVisibleRef.current = false;
      keyboardTopRef.current = windowHeight;
      lastFocusedRef.current = null;
    });
    const focusWatcher = setInterval(() => {
      if (keyboardVisibleRef.current) revealFocusedInput();
    }, 120);

    return () => {
      show.remove();
      hide.remove();
      clearInterval(focusWatcher);
    };
  }, [revealFocusedInput, windowHeight]);

  return (
    <ScrollView
      {...props}
      ref={scrollRef}
      onScroll={(event) => {
        scrollYRef.current = event.nativeEvent.contentOffset.y;
        onScroll?.(event);
      }}
      scrollEventThrottle={scrollEventThrottle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      contentInsetAdjustmentBehavior={contentInsetAdjustmentBehavior}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    />
  );
}
