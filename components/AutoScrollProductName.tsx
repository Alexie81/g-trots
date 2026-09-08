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
    const duration = Math.max(1900, distance * 16);
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(550),
      Animated.timing(translateX, { toValue: -distance, duration, easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(400),
      Animated.timing(translateX, { toValue: 0, duration: Math.max(750, duration * 0.46), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(550),
    ]));
    animation.start();
    return () => animation.stop();
  }, [distance, translateX, value]);

  const readContainer = (event: LayoutChangeEvent) => setContainerWidth(event.nativeEvent.layout.width);
  const readText = (width: number) => setTextWidth(Math.ceil(width));
  const animatedWidth = Math.max(containerWidth, textWidth + 4);

  return (
    <View style={{ alignSelf: 'stretch', flexShrink: 1, minWidth: 0, overflow: 'hidden' }} onLayout={readContainer}>
      <Text
        accessible={false}
        numberOfLines={1}
        onTextLayout={(event) => readText(event.nativeEvent.lines[0]?.width || 0)}
        pointerEvents="none"
        style={[style, { position: 'absolute', width: 10000, opacity: 0 }]}
      >
        {value}
      </Text>
      <Animated.View style={{ alignSelf: 'flex-start', width: animatedWidth, opacity: textWidth > 0 ? 1 : 0, transform: [{ translateX }] }}>
        <Text numberOfLines={1} ellipsizeMode="clip" style={style}>{value}</Text>
      </Animated.View>
    </View>
  );
}
