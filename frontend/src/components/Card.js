import React from 'react';
import {StyleSheet, View} from 'react-native';
import {cards, colors, spacing} from '../theme';

export default function Card({children, style}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {backgroundColor: colors.surface, borderColor: colors.border, borderWidth: cards.borderWidth, borderRadius: cards.radius, padding: cards.padding, marginBottom: spacing.md, shadowColor: '#000000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2},
});
