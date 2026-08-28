import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity} from 'react-native';
import Icon from './Icon';
import {buttons, colors, spacing, textStyle, typography} from '../theme';

const variants = {
  primary: {backgroundColor: colors.primary, color: colors.surface},
  secondary: {backgroundColor: colors.secondary, color: colors.surface},
  danger: {backgroundColor: colors.danger, color: colors.surface},
  success: {backgroundColor: colors.success, color: colors.surface},
  outline: {backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1, color: colors.primary},
  ghost: {backgroundColor: 'transparent', color: colors.text},
};

export default function Button({title, variant = 'primary', icon, loading = false, disabled = false, onPress, style, textStyle: labelStyle, ...props}) {
  const appearance = variants[variant] || variants.primary;
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{disabled: isDisabled}}
      disabled={isDisabled}
      onPress={onPress}
      style={[styles.button, appearance, isDisabled && styles.disabled, style]}
      {...props}>
      {loading ? <ActivityIndicator color={appearance.color} /> : icon ? <Icon name={icon} size={buttons.iconSize} color={appearance.color} /> : null}
      {!loading && title ? <Text style={[styles.text, {color: appearance.color}, icon && styles.withIcon, labelStyle]}>{title}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {minHeight: buttons.height, paddingHorizontal: buttons.paddingHorizontal, borderRadius: buttons.radius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm},
  text: textStyle(typography.button),
  withIcon: {marginLeft: spacing.xs},
  disabled: {backgroundColor: colors.disabled, borderColor: colors.disabled},
});
