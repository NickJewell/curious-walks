import React from "react";
import PagerView from "react-native-pager-view";
import { StyleSheet, ViewStyle } from "react-native";

interface PagerViewCompatProps {
  style?: ViewStyle;
  initialPage?: number;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
  children: React.ReactNode;
}

export default function PagerViewCompat({
  style,
  initialPage = 0,
  onPageSelected,
  children,
}: PagerViewCompatProps) {
  return (
    <PagerView
      style={[styles.pager, style]}
      initialPage={initialPage}
      onPageSelected={onPageSelected}
    >
      {children}
    </PagerView>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
});
