import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  TextInput,
  useWindowDimensions,
} from 'react-native';

type Props = ScrollViewProps & {
  extraScrollHeight?: number;
};

const KeyboardAwareScrollView = forwardRef<ScrollView, Props>(function KeyboardAwareScrollView({
  extraScrollHeight = 110,
  keyboardShouldPersistTaps = 'handled',
  keyboardDismissMode = 'on-drag',
  contentInsetAdjustmentBehavior = 'automatic',
  contentContainerStyle,
  onScroll,
  scrollEventThrottle = 16,
  ...props
}: Props, forwardedRef) {
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const keyboardVisibleRef = useRef(false);
  const keyboardTopRef = useRef(windowHeight);
  const scrollYRef = useRef(0);
  const lastFocusedRef = useRef<unknown>(null);
  const focusWatcherRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useImperativeHandle(forwardedRef, () => scrollRef.current as ScrollView);

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
      setKeyboardInset(Math.max(0, Number(event.endCoordinates?.height || 0) + extraScrollHeight));
      setTimeout(() => revealFocusedInput(true), Platform.OS === 'ios' ? 80 : 140);
      if (!focusWatcherRef.current) {
        focusWatcherRef.current = setInterval(() => revealFocusedInput(), 120);
      }
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardVisibleRef.current = false;
      keyboardTopRef.current = windowHeight;
      lastFocusedRef.current = null;
      setKeyboardInset(0);
      if (focusWatcherRef.current) clearInterval(focusWatcherRef.current);
      focusWatcherRef.current = null;
    });

    return () => {
      show.remove();
      hide.remove();
      if (focusWatcherRef.current) clearInterval(focusWatcherRef.current);
      focusWatcherRef.current = null;
    };
  }, [extraScrollHeight, revealFocusedInput, windowHeight]);

  const adjustedContentContainerStyle = useMemo(() => {
    if (!keyboardInset) return contentContainerStyle;
    const flattened = StyleSheet.flatten(contentContainerStyle) || {};
    return [contentContainerStyle, { paddingBottom: Number(flattened.paddingBottom || 0) + keyboardInset }];
  }, [contentContainerStyle, keyboardInset]);

  return (
    <ScrollView
      {...props}
      ref={scrollRef}
      contentContainerStyle={adjustedContentContainerStyle}
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
});

export default KeyboardAwareScrollView;
