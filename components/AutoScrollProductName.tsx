import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleProp, Text, TextStyle, View } from 'react-native';

export default function AutoScrollProductName({ value, style }: { value: string; style?: StyleProp<TextStyle> }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const distance = Math.max(0, textWidth - containerWidth + 10);

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (distance <= 2) return;
    const duration = Math.max(2600, distance * 22);
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(850),
      Animated.timing(translateX, { toValue: -distance, duration, easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(650),
      Animated.timing(translateX, { toValue: 0, duration: Math.max(900, duration * 0.48), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(850),
    ]));
    animation.start();
    return () => animation.stop();
  }, [distance, translateX, value]);

  const readContainer = (event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width);
  const readText = (event: LayoutChangeEvent) => setTextWidth(event.nativeEvent.layout.width);

  return (
    <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }} onLayout={readContainer}>
      <Animated.View style={{ alignSelf: 'flex-start', transform: [{ translateX }] }}>
        <Text numberOfLines={1} onLayout={readText} style={style}>{value}</Text>
      </Animated.View>
    </View>
  );
}
