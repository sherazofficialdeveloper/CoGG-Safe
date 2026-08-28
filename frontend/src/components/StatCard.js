import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from './Icon';
import {cards, colors, spacing, textStyle, typography} from '../theme';

const tones = {
  primary: {iconBackground: '#FDE5E8', iconColor: colors.primary, numberColor: colors.text},
  success: {iconBackground: '#E7F5ED', iconColor: colors.success, numberColor: colors.success},
  muted: {iconBackground: '#EEF0F3', iconColor: colors.mutedText, numberColor: colors.text},
  danger: {iconBackground: '#FDE5E8', iconColor: colors.danger, numberColor: colors.danger},
};

export default function StatCard({title, value, icon, tone = 'primary', supportingText, loading = false, onPress}) {
  const appearance = tones[tone] || tones.primary;
  const content = (
    <>
      <View style={[styles.icon, {backgroundColor: appearance.iconBackground}]}>
        <Icon name={icon} size={22} color={appearance.iconColor} />
      </View>
      <Text style={[styles.value, {color: appearance.numberColor}]}>{loading ? '-' : value.toLocaleString()}</Text>
      <Text style={styles.title}>{title}</Text>
      {supportingText ? <Text style={styles.supporting}>{supportingText}</Text> : null}
    </>
  );

  return onPress ? <TouchableOpacity accessibilityRole="button" onPress={onPress} activeOpacity={0.78} style={styles.card}>{content}</TouchableOpacity> : <View style={styles.card}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {width: '31%', minHeight: 132, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: cards.borderWidth, borderRadius: cards.radius, padding: spacing.md, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2},
  icon: {width: 42, height: 42, borderRadius: spacing.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm},
  value: textStyle({fontSize: 24, fontWeight: typography.fontWeight.heavy}),
  title: textStyle({...typography.label, color: colors.text, textAlign: 'center', marginTop: spacing.xs}),
  supporting: textStyle({...typography.caption, color: colors.mutedText, textAlign: 'center', marginTop: spacing.xs}),
});
